import type { EventEnvelope } from '@toka/contracts';
import type { EventPublisher, RoleCache, RoleData, RoleRepository } from '../application/ports';
import { DuplicateRoleError, Role, VersionConflictError } from '../domain/role';

export class FakeRoleRepo implements RoleRepository {
  items = new Map<string, Role>();
  reads = 0;
  async create(role: Role) {
    if ([...this.items.values()].some((r) => r.name === role.name)) throw new DuplicateRoleError(role.name);
    this.items.set(role.id, { ...role });
    return { ...role };
  }
  async findById(id: string) {
    this.reads++;
    const r = this.items.get(id);
    return r ? { ...r } : null;
  }
  async list() {
    return [...this.items.values()].map((r) => ({ ...r }));
  }
  async update(id: string, data: RoleData, expected?: number) {
    const cur = this.items.get(id);
    if (!cur) return null;
    if (expected !== undefined && expected !== cur.version) throw new VersionConflictError();
    const next = { ...cur, ...data, version: cur.version + 1 };
    this.items.set(id, next);
    return { ...next };
  }
}

export class FakeCache implements RoleCache {
  store = new Map<string, Role>();
  async get(id: string) {
    return this.store.get(id) ?? null;
  }
  async set(r: Role) {
    this.store.set(r.id, r);
  }
  async del(id: string) {
    this.store.delete(id);
  }
}

export class FakePublisher implements EventPublisher {
  events: EventEnvelope<unknown>[] = [];
  async publish(e: EventEnvelope<unknown>) {
    this.events.push(e);
  }
}
