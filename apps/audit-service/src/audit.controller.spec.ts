import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '@toka/jwt-guard';
import { AuditConsumer } from './audit.consumer';
import { AuditController, MONGO_READY } from './audit.controller';
import { AuditProcessor } from './audit.processor';
import { RolesGuard } from './roles.guard';

class FakeJwt implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    req.user = { sub: 'u', roles: String(req.headers['x-roles'] ?? '').split(',').filter(Boolean) };
    return true;
  }
}

describe('AuditController', () => {
  let app: INestApplication;
  const audit = { query: jest.fn().mockResolvedValue({ items: [], page: 1, limit: 20, total: 0 }) };
  const consumer = { isConnected: jest.fn().mockReturnValue(true) };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [
        { provide: AuditProcessor, useValue: audit },
        { provide: AuditConsumer, useValue: consumer },
        { provide: MONGO_READY, useValue: () => true },
        RolesGuard,
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

  it('200 for admin with filters passed through; 403 for non-admin', async () => {
    const res = await request(app.getHttpServer())
      .get('/audit/events?type=user.created&actor=a1&from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z&page=2&limit=5')
      .set('x-roles', 'admin');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], page: 1, limit: 20, total: 0 });
    expect(audit.query).toHaveBeenCalledWith(expect.objectContaining({ type: 'user.created', actor: 'a1', page: 2, limit: 5, from: new Date('2026-01-01T00:00:00Z') }));
    expect((await request(app.getHttpServer()).get('/audit/events').set('x-roles', 'user')).status).toBe(403);
  });

  it('400 for limit>100, bad date or from>to; 503 when the store fails', async () => {
    const get = (q: string) => request(app.getHttpServer()).get(`/audit/events${q}`).set('x-roles', 'admin');
    expect((await get('?limit=101')).status).toBe(400);
    expect((await get('?from=yesterday')).status).toBe(400);
    expect((await get('?from=2026-03-01T00:00:00Z&to=2026-01-01T00:00:00Z')).status).toBe(400);
    audit.query.mockRejectedValueOnce(new Error('mongo'));
    expect((await get('')).status).toBe(503);
  });

  it('health 200; ready 503 while the consumer is disconnected', async () => {
    expect((await request(app.getHttpServer()).get('/health')).status).toBe(200);
    expect((await request(app.getHttpServer()).get('/ready')).status).toBe(200);
    consumer.isConnected.mockReturnValueOnce(false);
    expect((await request(app.getHttpServer()).get('/ready')).status).toBe(503);
  });
});
