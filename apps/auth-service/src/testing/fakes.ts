import { generateKeyPairSync } from 'crypto';
import type { EventEnvelope } from '@toka/contracts';
import type {
  Clock,
  CredentialRepository,
  DenylistWriter,
  EventPublisher,
  PasswordHasher,
  ProjectionRepository,
  RefreshTokenRepository,
} from '../application/ports';
import type { AuthConfig } from '../config/config';
import type { CredentialRecord, CredentialStatus, RefreshTokenRecord } from '../domain/errors';

export class FakeCredentials implements CredentialRepository {
  items = new Map<string, CredentialRecord>();
  async findByEmail(email: string) {
    return [...this.items.values()].find((c) => c.email === email) ?? null;
  }
  async findByUserId(id: string) {
    return this.items.get(id) ?? null;
  }
  async save(r: CredentialRecord) {
    const cur = this.items.get(r.userId);
    this.items.set(r.userId, { ...r, status: cur?.status ?? r.status });
  }
  async setStatus(id: string, status: CredentialStatus) {
    const cur = this.items.get(id);
    if (cur) cur.status = status;
  }
  async delete(id: string) {
    this.items.delete(id);
  }
}

export class FakeProjection implements ProjectionRepository {
  users = new Map<string, { roleId: string; lastVersion: number }>();
  roles = new Map<string, { name: string; lastVersion: number; permissions: string[] }>();
  processed = new Set<string>();
  async getUserRole(id: string) {
    return this.users.get(id) ?? null;
  }
  async saveUserRole(id: string, roleId: string, lastVersion: number) {
    this.users.set(id, { roleId, lastVersion });
  }
  async setUserVersion(id: string, lastVersion: number) {
    const u = this.users.get(id);
    if (u) u.lastVersion = lastVersion;
  }
  async getRoleName(id: string) {
    return this.roles.get(id) ?? null;
  }
  async saveRoleName(id: string, name: string, lastVersion: number, permissions?: string[]) {
    this.roles.set(id, { name, lastVersion, permissions: permissions ?? this.roles.get(id)?.permissions ?? [] });
  }
  async deleteUser(id: string) {
    this.users.delete(id);
  }
  async isProcessed(id: string) {
    return this.processed.has(id);
  }
  async markProcessed(id: string) {
    this.processed.add(id);
  }
}

export class FakeRefreshTokens implements RefreshTokenRepository {
  items: RefreshTokenRecord[] = [];
  async create(r: Omit<RefreshTokenRecord, 'rotatedAt' | 'revokedAt'>) {
    this.items.push({ ...r, rotatedAt: null, revokedAt: null });
  }
  async findByHash(h: string) {
    return this.items.find((i) => i.tokenHash === h) ?? null;
  }
  async markRotated(id: string, at: Date) {
    const i = this.items.find((x) => x.id === id);
    if (!i || i.rotatedAt) return false;
    i.rotatedAt = at;
    return true;
  }
  async revokeFamily(familyId: string, at: Date) {
    this.items.filter((i) => i.familyId === familyId).forEach((i) => (i.revokedAt ??= at));
  }
  async revokeAllForUser(userId: string, at: Date) {
    this.items.filter((i) => i.userId === userId).forEach((i) => (i.revokedAt ??= at));
  }
}

export class FakeDenylist implements DenylistWriter {
  jti = new Map<string, number>();
  users = new Map<string, { epoch: number; ttl: number }>();
  async denyJti(jti: string, ttl: number) {
    this.jti.set(jti, ttl);
  }
  async denyUser(id: string, epoch: number, ttl: number) {
    this.users.set(id, { epoch, ttl });
  }
}

export class FakeHasher implements PasswordHasher {
  async hash(p: string) {
    return `h:${p}`;
  }
  async verify(h: string, p: string) {
    return h === `h:${p}`;
  }
}

export class FakePublisher implements EventPublisher {
  events: EventEnvelope<unknown>[] = [];
  async publish(e: EventEnvelope<unknown>) {
    this.events.push(e);
  }
}

export class FixedClock implements Clock {
  constructor(public current = new Date()) {}
  now() {
    return this.current;
  }
}

export const testConfig = (over: Partial<AuthConfig> = {}): AuthConfig => ({
  port: 3001,
  databaseUrl: 'x',
  redisUrl: 'x',
  rabbitmqUrl: 'x',
  jwtPrivateKeyPath: 'x',
  jwtKid: 'test-kid',
  jwtIssuer: 'toka-auth',
  accessTokenTtl: 900,
  refreshTokenTtl: 3600,
  serviceTokenTtl: 300,
  cookieSecure: false,
  serviceClients: [{ id: 'user-service', secret: 's3cret' }],
  retryDelaysMs: [10, 20, 30],
  maxRetries: 3,
  publishRetries: 2,
  ...over,
});

export const testPrivateKeyPem = (): string =>
  generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
