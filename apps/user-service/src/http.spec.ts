import { CanActivate, ConflictException, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard, PermissionsGuard } from '@toka/jwt-guard';
import { PrismaClient } from './generated/prisma';
import { HealthController } from './health.controller';
import { AdminSeedService } from './lifecycle';
import { EVENT_PUBLISHER } from './outbox.publisher';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

class FakeJwt implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    req.user = { sub: 'u1', roles: [], permissions: String(req.headers['x-perms'] ?? '').split(',').filter(Boolean) };
    return true;
  }
}

describe('HTTP layer', () => {
  let app: INestApplication;
  const users = {
    create: jest.fn(),
    list: jest.fn().mockResolvedValue({ items: [], page: 1, limit: 20, total: 0 }),
  };
  const prisma = { $queryRaw: jest.fn().mockResolvedValue([1]) };
  const publisher = { isReady: jest.fn().mockResolvedValue(true) };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [UsersController, HealthController],
      providers: [
        { provide: UsersService, useValue: users },
        { provide: PrismaClient, useValue: prisma },
        { provide: EVENT_PUBLISHER, useValue: publisher },
        PermissionsGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(FakeJwt)
      .compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });
  afterAll(() => app.close());

  const body = { name: 'A', email: 'a@x.io', password: 'longpassword', roleId: 'r1' };

  it('POST /users: 201 for admin, 403 without users:write, 400 on invalid body', async () => {
    users.create.mockResolvedValue({ id: 'n', ...body, status: 'ACTIVE' });
    const ok = await request(app.getHttpServer()).post('/users').set('x-perms', 'users:write').send(body);
    expect(ok.status).toBe(201);
    expect(ok.body).toEqual({ id: 'n', name: 'A', email: 'a@x.io', roleId: 'r1', status: 'ACTIVE' });
    expect((await request(app.getHttpServer()).post('/users').set('x-perms', 'users:read').send(body)).status).toBe(403);
    expect((await request(app.getHttpServer()).post('/users').set('x-perms', 'users:write').send({ ...body, email: 'no' })).status).toBe(400);
  });

  it('GET /users paginates with defaults; limit>100 is 400', async () => {
    const ok = await request(app.getHttpServer()).get('/users').set('x-perms', 'users:read');
    expect(ok.body).toEqual({ items: [], page: 1, limit: 20, total: 0 });
    expect(users.list).toHaveBeenCalledWith(1, 20);
    expect((await request(app.getHttpServer()).get('/users?limit=101').set('x-perms', 'users:read')).status).toBe(400);
  });

  it('health is 200; ready is 503 when the broker is down', async () => {
    expect((await request(app.getHttpServer()).get('/health')).status).toBe(200);
    expect((await request(app.getHttpServer()).get('/ready')).status).toBe(200);
    publisher.isReady.mockResolvedValueOnce(false);
    expect((await request(app.getHttpServer()).get('/ready')).status).toBe(503);
  });
});

describe('AdminSeedService', () => {
  const cfg = { adminSeedEmail: 'root@x.io', adminSeedPassword: 'pw-not-logged', adminSeedRoleId: 'rid' };
  const retry = { attempts: 2, delayMs: 1 };

  it('creates the admin with actor=system when missing; skips when it exists', async () => {
    const users = { existsByEmail: jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true), create: jest.fn().mockResolvedValue({}) };
    const seed = new AdminSeedService(users as never, cfg, retry);
    expect(await seed.seed()).toBe(true);
    expect(users.create).toHaveBeenCalledWith(expect.objectContaining({ email: 'root@x.io', roleId: 'rid' }), 'system', expect.any(String));
    expect(await seed.seed()).toBe(true);
    expect(users.create).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and gives up after the bounded attempts', async () => {
    const users = { existsByEmail: jest.fn().mockResolvedValue(false), create: jest.fn().mockRejectedValue(new ConflictException('x')) };
    const seed = new AdminSeedService(users as never, cfg, retry);
    expect(await seed.seed()).toBe(false);
    expect(users.create).toHaveBeenCalledTimes(2);
  });
});
