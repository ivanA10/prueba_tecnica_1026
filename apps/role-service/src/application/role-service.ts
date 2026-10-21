import { randomUUID } from 'crypto';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createEnvelope, deterministicEventId, EventActor, RoutingKeys } from '@toka/contracts';
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
    if (await this.roles.findById(adminRoleId)) return;
    await this.create({ name: 'admin', description: 'Administrator', permissions: ['*'] }, 'system', adminRoleId);
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
