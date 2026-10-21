import type { EventEnvelope } from '@toka/contracts';
import type { Role } from '../../domain/role';

export interface RoleData {
  name: string;
  description: string | null;
  permissions: string[];
}

export interface RoleRepository {
  /** Throws DuplicateRoleError on name clash. */
  create(role: Role): Promise<Role>;
  findById(id: string): Promise<Role | null>;
  list(): Promise<Role[]>;
  /**
   * Atomically applies data and increments version. Returns null when not found;
   * throws VersionConflictError if expectedVersion is given and does not match,
   * DuplicateRoleError on name clash.
   */
  update(id: string, data: RoleData, expectedVersion?: number): Promise<Role | null>;
}

export interface RoleCache {
  get(id: string): Promise<Role | null>;
  set(role: Role): Promise<void>;
  del(id: string): Promise<void>;
}

export interface EventPublisher {
  publish(envelope: EventEnvelope<unknown>): Promise<void>;
}

export const TOKENS = {
  Roles: 'RoleRepository',
  Cache: 'RoleCache',
  Publisher: 'EventPublisher',
  Config: 'RoleConfig',
  Logger: 'Logger',
} as const;
