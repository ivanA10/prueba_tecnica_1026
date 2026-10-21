import { createEnvelope, EventEnvelope } from '@toka/contracts';
import { AuthService } from './token-service';
import { MessageProcessor, ProjectionHandler } from './projection-handler';
import { ResilientEventPublisher } from './resilient-publisher';
import {
  FakeCredentials,
  FakeDenylist,
  FakeHasher,
  FakeProjection,
  FakePublisher,
  FakeRefreshTokens,
  FixedClock,
  testConfig,
} from '../testing/fakes';
import { Argon2Hasher } from '../infrastructure/crypto/crypto';
import { loadConfig } from '../config/config';

const U = '11111111-1111-4111-8111-111111111111';
const R = '22222222-2222-4222-8222-222222222222';

const env = (type: string, aggregateVersion: number, payload: Record<string, unknown>): EventEnvelope<unknown> =>
  createEnvelope({ type, aggregateVersion, correlationId: 'c', actor: 'system', payload });

describe('projection consumer', () => {
  let creds: FakeCredentials;
  let proj: FakeProjection;
  let tokens: FakeRefreshTokens;
  let deny: FakeDenylist;
  let handler: ProjectionHandler;
  const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));

  beforeEach(async () => {
    creds = new FakeCredentials();
    proj = new FakeProjection();
    tokens = new FakeRefreshTokens();
    deny = new FakeDenylist();
    const auth = new AuthService(
      creds,
      proj,
      tokens,
      deny,
      new FakeHasher(),
      { sign: jest.fn() },
      new FakePublisher(),
      clock,
      testConfig(),
    );
    handler = new ProjectionHandler(creds, proj, auth);
    await creds.save({ userId: U, email: 'a@b.com', passwordHash: 'h', status: 'PENDING' });
  });

  it('role.created / role.updated project permissions, last version wins', async () => {
    await handler.handle(env('role.created', 1, { roleId: R, name: 'op', permissions: ['users:read'] }));
    expect(proj.roles.get(R)).toEqual({ name: 'op', lastVersion: 1, permissions: ['users:read'] });
    await handler.handle(env('role.updated', 3, { roleId: R, name: 'op', permissions: ['*'] }));
    await handler.handle(env('role.updated', 2, { roleId: R, name: 'old', permissions: [] }));
    expect(proj.roles.get(R)).toEqual({ name: 'op', lastVersion: 3, permissions: ['*'] });
  });

  it('user.created activates only PENDING credentials; duplicate event is a no-op', async () => {
    const e = env('user.created', 1, { userId: U, email: 'a@b.com', roleId: R, status: 'ACTIVE' });
    await handler.handle(e);
    expect(creds.items.get(U)?.status).toBe('ACTIVE');
    expect(proj.users.get(U)).toEqual({ roleId: R, lastVersion: 1 });
    await creds.setStatus(U, 'DISABLED');
    await handler.handle(e);
    expect(creds.items.get(U)?.status).toBe('DISABLED');
  });

  it('user.updated(DISABLED) disables and revokes sessions (epoch seconds); stale versions are ignored', async () => {
    await creds.setStatus(U, 'ACTIVE');
    await proj.saveUserRole(U, R, 2);
    await handler.handle(env('user.updated', 2, { userId: U, status: 'DISABLED' }));
    expect(creds.items.get(U)?.status).toBe('ACTIVE');
    await handler.handle(env('user.updated', 3, { userId: U, status: 'DISABLED' }));
    expect(creds.items.get(U)?.status).toBe('DISABLED');
    expect(deny.users.get(U)).toEqual({ epoch: Math.floor(clock.now().getTime() / 1000), ttl: 900 });
    await handler.handle(env('user.updated', 4, { userId: U, status: 'ACTIVE', roleId: R }));
    expect(creds.items.get(U)?.status).toBe('ACTIVE');
  });

  it('user.deleted revokes and removes; role events keep role names fresh by version', async () => {
    await handler.handle(env('user.role.assigned', 1, { userId: U, roleId: R, roleName: 'admin', roleVersion: 1 }));
    expect(proj.roles.get(R)).toEqual({ name: 'admin', lastVersion: 1, permissions: [] });
    await handler.handle(env('role.updated', 2, { roleId: R, name: 'root' }));
    await handler.handle(env('role.updated', 1, { roleId: R, name: 'old' }));
    expect(proj.roles.get(R)?.name).toBe('root');
    await handler.handle(env('user.deleted', 5, { userId: U }));
    expect(creds.items.has(U)).toBe(false);
    expect(deny.users.has(U)).toBe(true);
  });

  it('processor: invalid envelope goes to DLQ, transient errors retry with growing count then DLQ', async () => {
    const p = new MessageProcessor(handler, { delaysMs: [10, 20], maxRetries: 2 });
    expect(await p.process('not json', 0)).toMatchObject({ kind: 'dlq' });
    expect(await p.process('{"foo":1}', 0)).toMatchObject({ kind: 'dlq' });
    expect(await p.process(JSON.stringify(env('user.weird', 1, {})), 0)).toMatchObject({ kind: 'dlq' });
    const transient = JSON.stringify(env('user.created', 1, { userId: 'unknown' }));
    expect(await p.process(transient, 0)).toEqual({ kind: 'retry', delayMs: 10, retryCount: 1 });
    expect(await p.process(transient, 1)).toEqual({ kind: 'retry', delayMs: 20, retryCount: 2 });
    expect(await p.process(transient, 2)).toMatchObject({ kind: 'dlq' });
    expect(await p.process(JSON.stringify(env('user.created', 1, { userId: U })), 0)).toEqual({ kind: 'ack' });
  });
});

describe('infrastructure helpers', () => {
  it('publisher exhausts retries and logs audit.fallback without throwing', async () => {
    const warn = jest.fn();
    const inner = { publish: jest.fn().mockRejectedValue(new Error('down')) };
    const pub = new ResilientEventPublisher(inner, { warn }, 3, 1);
    await expect(pub.publish(env('auth.login.failed', 0, {}))).resolves.toBeUndefined();
    expect(inner.publish).toHaveBeenCalledTimes(3);
    expect(warn.mock.calls[0][0]).toMatchObject({ event: 'audit.fallback' });
  });

  it('argon2id hashes and verifies', async () => {
    const h = new Argon2Hasher();
    const hashed = await h.hash('correct horse');
    expect(hashed).toMatch(/^\$argon2id\$/);
    expect(await h.verify(hashed, 'correct horse')).toBe(true);
    expect(await h.verify(hashed, 'wrong')).toBe(false);
    expect(await h.verify('garbage', 'x')).toBe(false);
  });

  it('config applies defaults and fails fast on missing required vars', () => {
    expect(() => loadConfig({})).toThrow(/SERVICE_CLIENTS/);
    const c = loadConfig({
      DATABASE_URL: 'd',
      REDIS_URL: 'r',
      RABBITMQ_URL: 'a',
      JWT_PRIVATE_KEY_PATH: '/k.pem',
      SERVICE_CLIENTS: 'user-service:s:ecret',
      SVC_CLIENT_ID: 'auth-service',
      SVC_CLIENT_SECRET: 'x',
    });
    expect(c).toMatchObject({ port: 3001, accessTokenTtl: 900, jwtIssuer: 'toka-auth', cookieSecure: true });
    expect(c.serviceClients).toEqual([
      { id: 'user-service', secret: 's:ecret' },
      { id: 'auth-service', secret: 'x' },
    ]);
  });
});
