import { CanActivate, ExecutionContext, INestApplication, Injectable, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { deterministicEventId } from '@toka/contracts';
import { JwtAuthGuard } from '@toka/jwt-guard';
import { TOKENS } from '../../application/ports';
import { ResilientEventPublisher } from '../../application/resilient-publisher';
import { RoleService } from '../../application/role-service';
import { loadConfig } from '../../config/config';
import { FakeCache, FakePublisher, FakeRoleRepo } from '../../testing/fakes';
import { HealthController, RolesController } from './controllers';
import { PermissionsGuard } from '@toka/jwt-guard';

@Injectable()
class HeaderGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const raw = req.headers['x-user'];
    if (!raw) return false;
    req.user = JSON.parse(raw as string);
    return true;
  }
}

const as = (roles: string[], permissions: string[] = roles.includes('admin') ? ['*'] : []) =>
  JSON.stringify({ sub: 'u-1', roles, permissions, jti: 'j', exp: 9999999999 });
/** client_credentials token as minted by auth-service (identity by scope, not by role name). */
const svcToken = () => JSON.stringify({ sub: 'user-service', roles: [], permissions: [], scope: ['svc:internal'], jti: 'j', exp: 9999999999 });
const ADMIN_ID = '00000000-0000-4000-8000-000000000001';

describe('role-service', () => {
  let app: INestApplication;
  let repo: FakeRoleRepo;
  let cache: FakeCache;
  let pub: FakePublisher;
  let service: RoleService;

  beforeEach(async () => {
    repo = new FakeRoleRepo();
    cache = new FakeCache();
    pub = new FakePublisher();
    const mod = await Test.createTestingModule({
      controllers: [RolesController, HealthController],
      providers: [
        { provide: TOKENS.Roles, useValue: repo },
        { provide: TOKENS.Cache, useValue: cache },
        { provide: TOKENS.Publisher, useValue: pub },
        PermissionsGuard,
        RoleService,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(HeaderGuard)
      .compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    service = app.get(RoleService);
  });

  afterEach(() => app.close());

  it('POST creates a role with version 1 and publishes role.created; duplicate name is 409', async () => {
    const res = await request(app.getHttpServer())
      .post('/roles')
      .set('x-user', as(['admin']))
      .send({ name: 'editor', permissions: ['users:write'] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'editor', version: 1, permissions: ['users:write'] });
    expect(pub.events.map((e) => [e.type, e.aggregateVersion])).toEqual([['role.created', 1]]);
    const dup = await request(app.getHttpServer())
      .post('/roles')
      .set('x-user', as(['admin']))
      .send({ name: 'editor', permissions: [] });
    expect(dup.status).toBe(409);
  });

  it('PUT bumps version, invalidates cache, publishes role.updated (+ permissions.changed only when they change)', async () => {
    const created = await service.create({ name: 'editor', description: null, permissions: ['users:read'] }, 'system');
    await cache.set(created);
    pub.events = [];
    const admin = as(['admin']);
    const res = await request(app.getHttpServer())
      .put(`/roles/${created.id}`)
      .set('x-user', admin)
      .send({ name: 'editor', permissions: ['users:read', 'users:write'], version: 1 });
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(2);
    expect(cache.store.has(created.id)).toBe(false);
    expect(pub.events.map((e) => e.type)).toEqual(['role.updated', 'role.permissions.changed']);
    expect(pub.events[0].eventId).not.toEqual(pub.events[1].eventId);

    pub.events = [];
    await request(app.getHttpServer()).put(`/roles/${created.id}`).set('x-user', admin).send({ name: 'editor', permissions: ['users:write', 'users:read'] });
    expect(pub.events.map((e) => e.type)).toEqual(['role.updated']);

    const stale = await request(app.getHttpServer())
      .put(`/roles/${created.id}`)
      .set('x-user', admin)
      .send({ name: 'editor', permissions: [], version: 1 });
    expect(stale.status).toBe(409);
    const missing = await request(app.getHttpServer())
      .put(`/roles/${ADMIN_ID}`)
      .set('x-user', admin)
      .send({ name: 'x', permissions: [] });
    expect(missing.status).toBe(404);
  });

  it('GET /roles/:id is cache-aside: miss fills the cache, hit does not touch the DB; list works', async () => {
    const created = await service.create({ name: 'editor', description: 'd', permissions: ['users:read'] }, 'system');
    repo.reads = 0;
    const svc = svcToken();
    const miss = await request(app.getHttpServer()).get(`/roles/${created.id}`).set('x-user', svc);
    expect(miss.status).toBe(200);
    expect(miss.body).toEqual({ id: created.id, name: 'editor', description: 'd', permissions: ['users:read'], version: 1 });
    expect(repo.reads).toBe(1);
    await request(app.getHttpServer()).get(`/roles/${created.id}`).set('x-user', svc);
    expect(repo.reads).toBe(1);
    expect((await request(app.getHttpServer()).get(`/roles/${ADMIN_ID}`).set('x-user', svc)).status).toBe(404);
    const list = await request(app.getHttpServer()).get('/roles').set('x-user', as(['admin']));
    expect(list.body).toHaveLength(1);
  });

  it('RBAC: without roles:write -> 403; roles:read lists; service can only read by id', async () => {
    const body = { name: 'x', permissions: [] };
    expect((await request(app.getHttpServer()).post('/roles').set('x-user', as(['user'])).send(body)).status).toBe(403);
    expect((await request(app.getHttpServer()).get('/roles').set('x-user', svcToken())).status).toBe(403);
    expect((await request(app.getHttpServer()).put(`/roles/${ADMIN_ID}`).set('x-user', svcToken()).send(body)).status).toBe(403);
    // A user whose role is merely *named* "service" gets no service bypass on GET /roles/:id.
    expect((await request(app.getHttpServer()).get(`/roles/${ADMIN_ID}`).set('x-user', as(['service']))).status).toBe(403);
    // ...and that name is reserved: it cannot be created.
    const reserved = await request(app.getHttpServer()).post('/roles').set('x-user', as(['admin'])).send({ name: ' Service ', permissions: [] });
    expect(reserved.status).toBe(400);
    expect((await request(app.getHttpServer()).get('/roles/not-a-uuid').set('x-user', svcToken())).status).toBe(400);
    expect((await request(app.getHttpServer()).get('/health')).status).toBe(200);
    const reader = as(['operador'], ['roles:read']);
    expect((await request(app.getHttpServer()).post('/roles').set('x-user', reader).send(body)).status).toBe(403);
    expect((await request(app.getHttpServer()).get('/roles').set('x-user', reader)).status).toBe(200);
  });

  it('rejects unknown permissions with 400 and accepts the wildcard', async () => {
    const admin = as(['admin']);
    const bad = await request(app.getHttpServer()).post('/roles').set('x-user', admin).send({ name: 'x', permissions: ['docs:write'] });
    expect(bad.status).toBe(400);
    const ok = await request(app.getHttpServer()).post('/roles').set('x-user', admin).send({ name: 'x', permissions: ['*'] });
    expect(ok.status).toBe(201);
  });

  it('no privilege escalation: update/create beyond the actor permissions -> 403 permission_escalation', async () => {
    const editor = as(['editor'], ['roles:read', 'roles:write']);
    const own = await service.create({ name: 'editor', description: null, permissions: ['roles:read', 'roles:write'] }, 'system');
    const up = await request(app.getHttpServer()).put(`/roles/${own.id}`).set('x-user', editor).send({ name: 'editor', permissions: ['*'] });
    expect(up.status).toBe(403);
    expect(up.body.message).toBe('permission_escalation');
    expect(repo.items.get(own.id)?.permissions).toEqual(['roles:read', 'roles:write']);
    const cr = await request(app.getHttpServer()).post('/roles').set('x-user', editor).send({ name: 'x', permissions: ['users:write'] });
    expect(cr.status).toBe(403);
    // subset (removing permissions) is allowed; an actor with * may grant anything
    const down = await request(app.getHttpServer()).put(`/roles/${own.id}`).set('x-user', editor).send({ name: 'editor', permissions: ['roles:read'] });
    expect(down.status).toBe(200);
    const star = await request(app.getHttpServer()).post('/roles').set('x-user', as(['admin'])).send({ name: 'y', permissions: ['*', 'users:write'] });
    expect(star.status).toBe(201);
  });

  it('the seeded admin role is immutable: rename or emptying -> 403 admin_role_immutable', async () => {
    await service.seedAdmin(ADMIN_ID);
    const admin = as(['admin']);
    const rename = await request(app.getHttpServer()).put(`/roles/${ADMIN_ID}`).set('x-user', admin).send({ name: 'root', permissions: ['*'] });
    expect(rename.status).toBe(403);
    expect(rename.body.message).toBe('admin_role_immutable');
    const empty = await request(app.getHttpServer()).put(`/roles/${ADMIN_ID}`).set('x-user', admin).send({ name: 'admin', permissions: [] });
    expect(empty.body.message).toBe('admin_role_immutable');
    const desc = await request(app.getHttpServer()).put(`/roles/${ADMIN_ID}`).set('x-user', admin).send({ name: 'admin', description: 'd', permissions: ['*'] });
    expect(desc.status).toBe(200);
  });

  it('seeds the admin role idempotently and re-sync emits deterministic role.updated events', async () => {
    await service.seedAdmin(ADMIN_ID);
    await service.seedAdmin(ADMIN_ID);
    expect(repo.items.get(ADMIN_ID)).toMatchObject({ name: 'admin', permissions: ['*'], version: 1 });
    expect(pub.events.filter((e) => e.type === 'role.created')).toHaveLength(1);
    pub.events = [];
    await service.resync();
    await service.resync();
    expect(pub.events).toHaveLength(2);
    expect(pub.events[0]).toMatchObject({
      type: 'role.updated',
      actor: 'system',
      reason: 'resync',
      eventId: deterministicEventId(ADMIN_ID, 1),
    });
    expect(pub.events[1].eventId).toBe(pub.events[0].eventId);
  });

  it('seeds operador and auditor idempotently with stable ids', async () => {
    const OP = '00000000-0000-4000-8000-000000000002';
    const AU = '00000000-0000-4000-8000-000000000003';
    await service.seedExampleRoles(OP, AU);
    await service.seedExampleRoles(OP, AU);
    expect(repo.items.get(OP)).toMatchObject({ name: 'operador', permissions: ['users:read', 'roles:read', 'audit:read', 'agent:ask'] });
    expect(repo.items.get(AU)).toMatchObject({ name: 'auditor', permissions: ['audit:read'] });
    expect(pub.events.filter((e) => e.type === 'role.created')).toHaveLength(2);
    expect(pub.events[0].payload).toMatchObject({ roleId: OP, permissions: ['users:read', 'roles:read', 'audit:read', 'agent:ask'] });
  });
});

describe('infrastructure helpers', () => {
  it('publisher failure logs role.publish.failed and does not throw', async () => {
    const warn = jest.fn();
    const inner = { publish: jest.fn().mockRejectedValue(new Error('down')) };
    const p = new ResilientEventPublisher(inner, { warn }, 2, 1);
    await expect(p.publish({} as never)).resolves.toBeUndefined();
    expect(inner.publish).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0][0]).toMatchObject({ event: 'role.publish.failed' });
  });

  it('config defaults and required vars', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
    expect(
      loadConfig({ DATABASE_URL: 'd', REDIS_URL: 'r', RABBITMQ_URL: 'a', AUTH_JWKS_URL: 'http://auth/jwks' }),
    ).toMatchObject({ port: 3003, cacheTtlSeconds: 300, adminRoleId: ADMIN_ID, jwtIssuer: 'toka-auth' });
  });
});
