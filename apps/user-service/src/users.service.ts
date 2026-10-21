import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EventActor, RoutingKeys, WILDCARD, createEnvelope, hasPermission } from '@toka/contracts';
import type { UserRoleAssignedPayload } from '@toka/contracts';
import {
  AUTH_CLIENT,
  AuthCredentialsClient,
  CredentialsConflictError,
  DependencyUnavailableError,
  EmailTakenError,
  ROLE_CLIENT,
  RoleClient,
  RoleNotFoundError,
  USER_REPOSITORY,
  UserNotFoundError,
  UserPatch,
  UserRecord,
  UserRepository,
} from './ports';
import { UserConfig } from './config';

export const USER_CONFIG = 'USER_CONFIG';
export const CLOCK = 'CLOCK';
export type Clock = () => number;

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  roleId: string;
}

class BudgetExhaustedError extends Error {}

/** No privilege escalation: the target role's permissions must be held by the actor ('system' is exempt). */
function assertCanAssign(actor: EventActor, actorPermissions: readonly string[], rolePermissions: readonly string[]): void {
  if (actor === 'system' || actorPermissions.includes(WILDCARD)) return;
  if (rolePermissions.some((p) => p === WILDCARD || !hasPermission(actorPermissions, p))) {
    throw new ForbiddenException('permission_escalation');
  }
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly repo: UserRepository,
    @Inject(ROLE_CLIENT) private readonly roles: RoleClient,
    @Inject(AUTH_CLIENT) private readonly auth: AuthCredentialsClient,
    @Inject(USER_CONFIG) private readonly config: Pick<UserConfig, 'signupBudgetMs' | 'reconcileGraceMs'>,
    @Inject(CLOCK) private readonly now: Clock,
  ) {}

  /** Signup saga: PENDING -> role -> credentials -> ACTIVE (+ outbox user.created). */
  async create(input: CreateUserInput, actor: EventActor, correlationId: string, actorPermissions: readonly string[] = []): Promise<UserRecord> {
    const start = this.now();
    const remaining = (): number => {
      const left = this.config.signupBudgetMs - (this.now() - start);
      if (left <= 0) throw new BudgetExhaustedError('signup budget exhausted');
      return left;
    };
    if (await this.repo.findByEmail(input.email)) throw new ConflictException('Email already in use');

    const id = randomUUID();
    let pending: UserRecord;
    try {
      pending = await this.repo.createPending({ id, email: input.email, name: input.name, roleId: input.roleId });
    } catch (err) {
      if (err instanceof EmailTakenError) throw new ConflictException('Email already in use');
      throw err;
    }

    try {
      const role = await this.roles.getRole(input.roleId, remaining(), correlationId);
      assertCanAssign(actor, actorPermissions, role.permissions);
      await this.auth.putCredentials(
        id,
        {
          email: input.email,
          password: input.password,
          roleId: role.id,
          roleName: role.name,
          roleVersion: role.version,
          rolePermissions: role.permissions,
        },
        remaining(),
        correlationId,
      );
      return await this.repo.persistWithOutbox(id, { status: 'ACTIVE' }, (u) =>
        createEnvelope({
          type: RoutingKeys.UserCreated,
          aggregateVersion: u.version,
          correlationId,
          actor,
          payload: { userId: u.id, email: u.email, name: u.name, roleId: u.roleId, status: u.status },
        }),
      );
    } catch (err) {
      const compensated = await this.compensate(pending.id, correlationId);
      if (compensated && err instanceof ForbiddenException) throw err;
      if (compensated && err instanceof RoleNotFoundError) throw new BadRequestException('Role not found');
      if (compensated && err instanceof CredentialsConflictError) {
        throw new ConflictException('Email already in use');
      }
      throw new ServiceUnavailableException('User creation failed, retry later');
    }
  }

  /** DELETE credentials first; delete the PENDING user only once confirmed. */
  private async compensate(userId: string, correlationId?: string): Promise<boolean> {
    try {
      await this.auth.deleteCredentials(userId, correlationId);
      await this.repo.deletePending(userId);
      return true;
    } catch {
      return false;
    }
  }

  async reconcilePending(): Promise<number> {
    const stale = await this.repo.findStalePending(new Date(this.now() - this.config.reconcileGraceMs));
    let cleaned = 0;
    for (const u of stale) {
      if (await this.compensate(u.id)) cleaned++;
    }
    return cleaned;
  }

  async list(page: number, limit: number) {
    const { items, total } = await this.repo.list(page, limit);
    return { items: items.map((u) => this.view(u)), page, limit, total };
  }

  async existsByEmail(email: string): Promise<boolean> {
    return (await this.repo.findByEmail(email)) !== null;
  }

  async get(id: string) {
    return this.view(await this.mustFind(id));
  }

  async update(id: string, patch: UserPatch, actor: EventActor, correlationId: string) {
    await this.mustFind(id);
    const changes = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    try {
      const user = await this.repo.persistWithOutbox(id, changes, (u) =>
        createEnvelope({
          type: RoutingKeys.UserUpdated,
          aggregateVersion: u.version,
          correlationId,
          actor,
          payload: { userId: u.id, changes, status: u.status },
        }),
      );
      return this.view(user);
    } catch (err) {
      if (err instanceof EmailTakenError) throw new ConflictException('Email already in use');
      throw this.mapNotFound(err);
    }
  }

  async remove(id: string, actor: EventActor, correlationId: string): Promise<void> {
    await this.mustFind(id);
    try {
      await this.repo.deleteWithOutbox(id, (u) =>
        createEnvelope({
          type: RoutingKeys.UserDeleted,
          aggregateVersion: u.version,
          correlationId,
          actor,
          payload: { userId: u.id },
        }),
      );
    } catch (err) {
      throw this.mapNotFound(err);
    }
  }

  async assignRole(id: string, roleId: string, actor: EventActor, correlationId: string, actorPermissions: readonly string[] = []) {
    await this.mustFind(id);
    if (actor !== 'system' && actor.userId === id && !actorPermissions.includes(WILDCARD)) {
      throw new ForbiddenException('permission_escalation');
    }
    let role;
    try {
      role = await this.roles.getRole(roleId, undefined, correlationId);
    } catch (err) {
      if (err instanceof RoleNotFoundError) throw new NotFoundException('Role not found');
      if (err instanceof DependencyUnavailableError) throw new ServiceUnavailableException('role-service unavailable');
      throw err;
    }
    assertCanAssign(actor, actorPermissions, role.permissions);
    try {
      const user = await this.repo.persistWithOutbox(id, { roleId }, (u) =>
        createEnvelope<UserRoleAssignedPayload>({
          type: RoutingKeys.UserRoleAssigned,
          aggregateVersion: u.version,
          correlationId,
          actor,
          payload: { userId: u.id, roleId: role.id, roleName: role.name, roleVersion: role.version, rolePermissions: role.permissions },
        }),
      );
      return this.view(user);
    } catch (err) {
      throw this.mapNotFound(err);
    }
  }

  private view(u: UserRecord) {
    return { id: u.id, name: u.name, email: u.email, roleId: u.roleId, status: u.status };
  }

  private async mustFind(id: string): Promise<UserRecord> {
    const u = await this.repo.findById(id);
    if (!u) throw new NotFoundException('User not found');
    return u;
  }

  private mapNotFound(err: unknown): unknown {
    return err instanceof UserNotFoundError ? new NotFoundException('User not found') : err;
  }
}
