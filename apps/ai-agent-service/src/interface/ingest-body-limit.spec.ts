import { CanActivate, INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard, PermissionsGuard } from '@toka/jwt-guard';
import { JSON_BODY_LIMIT } from './body-limit';
import { IngestController } from './ingest.controller';
import { INGEST_USE_CASE } from './tokens';

const allow: CanActivate = { canActivate: () => true };

describe('ingest body limit', () => {
  let app: INestApplication;
  const ingest = jest.fn().mockResolvedValue(3);

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [IngestController],
      providers: [{ provide: INGEST_USE_CASE, useValue: { ingest } }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(allow)
      .overrideGuard(PermissionsGuard)
      .useValue(allow)
      .compile();
    const nest = mod.createNestApplication<NestExpressApplication>({ bodyParser: true });
    nest.useBodyParser('json', { limit: JSON_BODY_LIMIT });
    nest.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    app = nest;
    await app.init();
  });
  afterAll(() => app.close());

  it('accepts a 150k-char document (default express limit is 100kb)', async () => {
    const res = await request(app.getHttpServer())
      .post('/agent/ingest')
      .send({ docId: 'big', source: 's', roleScope: ['all'], text: 'a'.repeat(150_000) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ docId: 'big', chunks: 3 });
  });
});
