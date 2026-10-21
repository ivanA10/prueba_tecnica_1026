import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { RequestLoggingInterceptor, correlationIdMiddleware, createLogger } from '@toka/logger';
import { PrismaClient } from './generated/prisma';
import { HealthController } from './health.controller';
import { PinoNestLogger } from './logging';
import { EVENT_PUBLISHER } from './outbox.publisher';

describe('structured logging', () => {
  let app: INestApplication;
  const lines: Record<string, unknown>[] = [];
  const logger = createLogger({ service: 'user-service', destination: { write: (s: string) => void lines.push(JSON.parse(s)) } });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaClient, useValue: { $queryRaw: jest.fn().mockResolvedValue([1]) } },
        { provide: EVENT_PUBLISHER, useValue: { isReady: jest.fn().mockResolvedValue(true) } },
      ],
    }).compile();
    app = mod.createNestApplication();
    app.use(correlationIdMiddleware);
    app.useGlobalInterceptors(new RequestLoggingInterceptor(logger));
    await app.init();
  });
  afterAll(() => app.close());

  it('emits a JSON access log with statusCode and correlationId; Nest logs go through pino', async () => {
    await request(app.getHttpServer()).get('/health').set('x-correlation-id', 'cid-1');
    expect(lines.find((l) => l.msg === 'request completed')).toMatchObject({
      service: 'user-service',
      method: 'GET',
      statusCode: 200,
      correlationId: 'cid-1',
    });
    new PinoNestLogger(logger).warn('hello', 'Ctx');
    expect(lines[lines.length - 1]).toMatchObject({ level: 'warn', msg: 'hello', context: 'Ctx' });
  });
});
