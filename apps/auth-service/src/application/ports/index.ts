import type { EventEnvelope } from '@toka/contracts';
import type { CredentialRecord, CredentialStatus, RefreshTokenRecord } from '../../domain/errors';

export interface CredentialRepository {
  findByEmail(email: string): Promise<CredentialRecord | null>;
  findByUserId(userId: string): Promise<CredentialRecord | null>;
  save(record: CredentialRecord): Promise<void>;
  setStatus(userId: string, status: CredentialStatus): Promise<void>;
  delete(userId: string): Promise<void>;
}

export interface ProjectionRepository {
  getUserRole(userId: string): Promise<{ roleId: string; lastVersion: number } | null>;
  saveUserRole(userId: string, roleId: string, lastVersion: number): Promise<void>;
  setUserVersion(userId: string, lastVersion: number): Promise<void>;
  getRoleName(roleId: string): Promise<{ name: string; lastVersion: number; permissions: string[] } | null>;
  /** `permissions` undefined keeps the stored ones (empty on first insert). */
  saveRoleName(roleId: string, name: string, lastVersion: number, permissions?: string[]): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  isProcessed(eventId: string): Promise<boolean>;
  markProcessed(eventId: string): Promise<void>;
}

export interface RefreshTokenRepository {
  create(record: Omit<RefreshTokenRecord, 'rotatedAt' | 'revokedAt'>): Promise<void>;
  findByHash(hash: string): Promise<RefreshTokenRecord | null>;
  /** Marks as rotated only if not rotated yet; returns false when lost the race. */
  markRotated(id: string, at: Date): Promise<boolean>;
  revokeFamily(familyId: string, at: Date): Promise<void>;
  revokeAllForUser(userId: string, at: Date): Promise<void>;
}

export interface DenylistWriter {
  denyJti(jti: string, ttlSeconds: number): Promise<void>;
  denyUser(userId: string, epochSeconds: number, ttlSeconds: number): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

export interface SignedToken {
  token: string;
  jti: string;
  iat: number;
  exp: number;
}

export interface TokenIssuer {
  sign(input: { sub: string; roles: string[]; permissions?: string[]; audience: string; ttlSeconds: number }): Promise<SignedToken>;
}

export interface EventPublisher {
  publish(envelope: EventEnvelope<unknown>): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export const TOKENS = {
  Credentials: 'CredentialRepository',
  Projection: 'ProjectionRepository',
  RefreshTokens: 'RefreshTokenRepository',
  Denylist: 'DenylistWriter',
  Hasher: 'PasswordHasher',
  Issuer: 'TokenIssuer',
  Publisher: 'EventPublisher',
  Clock: 'Clock',
  Config: 'AuthConfig',
  Logger: 'Logger',
} as const;
