import { randomUUID } from 'crypto';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createEnvelope, deterministicEventId, EventActor, PERMISSIONS, RoutingKeys, WILDCARD } from '@toka/contracts';
import { getCorrelationId } from '@toka/logger';
import { DuplicateRoleError, Role, samePermissions, VersionConflictError } from '../domain/role';
import { EventPublisher, RoleCache, RoleData, RoleRepository, TOKENS } from './ports';

const snapshot = (r: Role) => ({
  roleId: r.id,
  name: r.name,
  description: r.description,
  permissions: r.permissions,
});

@Injectable()
export class RoleService {
  constructor(
    @Inject(TOKENS.Roles) private readonly roles: RoleRepository,
    @Inject(TOKENS.Cache) private readonly cache: RoleCache,
    @Inject(TOKENS.Publisher) private readonly publisher: EventPublisher,
  ) {}

  private correlation(): string {
    return getCorrelationId() ?? randomUUID();
  }

  async create(data: RoleData, actor: EventActor, id: string = randomUUID()): Promise<Role> {
    let role: Role;
    try {
      role = await this.roles.create({ id, ...data, version: 1 });
    } catch (err) {
      if (err instanceof DuplicateRoleError) throw new ConflictException('role_name_taken');
      throw err;
    }
    await this.publisher.publish(
      createEnvelope({
        type: RoutingKeys.RoleCreated,
        aggregateVersion: role.version,
        correlationId: this.correlation(),
        actor,
        payload: snapshot(role),
      }),
    );
    return role;
  }

  async update(id: string, data: RoleData, actor: EventActor, expectedVersion?: number): Promise<Role> {
    const before = await this.roles.findById(id);
    if (!before) throw new NotFoundException('role_not_found');
    let role: Role | null;
    try {
      role = await this.roles.update(id, data, expectedVersion);
    } catch (err) {
      if (err instanceof DuplicateRoleError) throw new ConflictException('role_name_taken');
      if (err instanceof VersionConflictError) throw new ConflictException('version_conflict');
      throw err;
    }
    if (!role) throw new NotFoundException('role_not_found');
    await this.cache.del(id);

    const base = { aggregateVersion: role.version, correlationId: this.correlation(), actor, payload: snapshot(role) };
    await this.publisher.publish(createEnvelope({ type: RoutingKeys.RoleUpdated, ...base }));
    if (!samePermissions(before.permissions, role.permissions)) {
      await this.publisher.publish(createEnvelope({ type: RoutingKeys.RolePermissionsChanged, ...base }));
    }
    return role;
  }

  async get(id: string): Promise<Role> {
    const cached = await this.cache.get(id);
    if (cached) return cached;
    const role = await this.roles.findById(id);
    if (!role) throw new NotFoundException('role_not_found');
    await this.cache.set(role);
    return role;
  }

  list(): Promise<Role[]> {
    return this.roles.list();
  }

  /** Idempotent seed of the admin role with a fixed id (consumed by user-service bootstrap). */
  async seedAdmin(adminRoleId: string): Promise<void> {
    await this.seedRole(adminRoleId, 'admin', 'Administrator', [WILDCARD]);
  }

  /** Idempotent seed of the example roles (operador, auditor). */
  async seedExampleRoles(operadorRoleId: string, auditorRoleId: string): Promise<void> {
    await this.seedRole(operadorRoleId, 'operador', 'Operador', [
      PERMISSIONS.USERS_READ,
      PERMISSIONS.ROLES_READ,
      PERMISSIONS.AUDIT_READ,
      PERMISSIONS.AGENT_ASK,
    ]);
    await this.seedRole(auditorRoleId, 'auditor', 'Auditor', [PERMISSIONS.AUDIT_READ]);
  }

  private async seedRole(id: string, name: string, description: string, permissions: string[]): Promise<void> {
    if (await this.roles.findById(id)) return;
    try {
      await this.create({ name, description, permissions }, 'system', id);
    } catch (err) {
      if (err instanceof ConflictException) return; // name already taken (e.g. created manually)
      throw err;
    }
  }

  /** Re-publishes every role as role.updated (deterministic eventId) to recover lost publications. */
  async resync(): Promise<number> {
    const all = await this.roles.list();
    for (const role of all) {
      await this.publisher.publish(
        createEnvelope({
          type: RoutingKeys.RoleUpdated,
          eventId: deterministicEventId(role.id, role.version),
          aggregateVersion: role.version,
          correlationId: this.correlation(),
          actor: 'system',
          reason: 'resync',
          payload: snapshot(role),
        }),
      );
    }
    return all.length;
  }
}
