import type { EventEnvelope } from '@toka/contracts';

export type UserStatus = 'PENDING' | 'ACTIVE' | 'DISABLED';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  roleId: string;
  status: UserStatus;
  version: number;
  createdAt: Date;
}

export interface UserPatch {
  name?: string;
  email?: string;
  status?: UserStatus;
  roleId?: string;
}

export type EventBuilder = (user: UserRecord) => EventEnvelope<unknown>;

export class EmailTakenError extends Error {}
export class UserNotFoundError extends Error {}

export interface UserRepository {
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  createPending(data: { id: string; email: string; name: string; roleId: string }): Promise<UserRecord>;
  /** Updates the user, bumps version and writes the outbox event in ONE transaction. */
  persistWithOutbox(id: string, patch: UserPatch, build: EventBuilder): Promise<UserRecord>;
  /** Hard-deletes the user and writes the event (version+1) in ONE transaction. */
  deleteWithOutbox(id: string, build: EventBuilder): Promise<void>;
  deletePending(id: string): Promise<void>;
  list(page: number, limit: number): Promise<{ items: UserRecord[]; total: number }>;
  findStalePending(createdBefore: Date): Promise<UserRecord[]>;
}

export interface RoleInfo {
  id: string;
  name: string;
  version: number;
  permissions: string[];
}

export class RoleNotFoundError extends Error {}
export class DependencyUnavailableError extends Error {}
export class CredentialsConflictError extends Error {}

export interface RoleClient {
  getRole(roleId: string, budgetMs: number | undefined, correlationId?: string): Promise<RoleInfo>;
}

export interface AuthCredentialsClient {
  putCredentials(
    userId: string,
    body: { email: string; password: string; roleId: string; roleName: string; roleVersion: number; rolePermissions: string[] },
    budgetMs: number | undefined,
    correlationId?: string,
  ): Promise<void>;
  deleteCredentials(userId: string, correlationId?: string): Promise<void>;
}

export const USER_REPOSITORY = 'USER_REPOSITORY';
export const ROLE_CLIENT = 'ROLE_CLIENT';
export const AUTH_CLIENT = 'AUTH_CLIENT';
