import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JWT_GUARD_OPTIONS } from '@toka/jwt-guard';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AskAgentUseCase } from '../src/application/ask/ask-agent.use-case';
import { IngestDocumentUseCase } from '../src/application/ingest/ingest-document.use-case';
import { UserToolUnavailableError } from '../src/application/ports/user-directory-gateway.port';
import { loadConfig } from '../src/config/config';
import { HashEmbeddingProvider } from '../src/infrastructure/embeddings/hash-embedding.provider';
import { MockProvider } from '../src/infrastructure/llm/mock.provider';
import { InMemoryKnowledgeStore } from '../src/infrastructure/qdrant/in-memory.knowledge-store';
import {
  AGENT_CONFIG,
  ASK_USE_CASE,
  EMBEDDING_PROVIDER_TOKEN,
  INGEST_USE_CASE,
  KNOWLEDGE_STORE_TOKEN,
  RATE_LIMITER,
  REDIS,
} from '../src/interface/tokens';

describe('POST /agent/ask (e2e, keyless)', () => {
  let app: INestApplication;
  let sign: (roles: string[], permissions: string[]) => Promise<string>;
  const lookup = jest.fn();

  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
    sign = (roles, permissions) =>
      new SignJWT({ roles, permissions })
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setSubject('user-1')
        .setJti(`j-${Math.random()}`)
        .setIssuer('toka-auth')
        .setAudience('toka-api')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);

    const cfg = {
      ...loadConfig({ JWKS_URI: 'x', REDIS_URL: 'x', QDRANT_URL: 'x', USER_SERVICE_URL: 'x' }),
      ragMinScore: 0.12,
      knowledgeDir: join(__dirname, '..', 'knowledge'),
    };
    const embedder = new HashEmbeddingProvider();
    const store = new InMemoryKnowledgeStore();
    const ask = new AskAgentUseCase({
      embedder,
      store,
      llm: new MockProvider(),
      users: { lookup },
      metrics: { record: () => undefined },
      settings: cfg,
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AGENT_CONFIG).useValue(cfg)
      .overrideProvider(REDIS).useValue({})
      .overrideProvider(JWT_GUARD_OPTIONS).useValue({
        issuer: 'toka-auth',
        audience: 'toka-api',
        keyResolver: createLocalJWKSet({ keys: [jwk] }),
        denylist: { isJtiDenied: async () => false, getUserDenyEpoch: async () => null },
        logger: { warn: () => undefined },
      })
      .overrideProvider(RATE_LIMITER).useValue({ hit: async () => ({ allowed: true, retryAfterSeconds: 0 }) })
      .overrideProvider(EMBEDDING_PROVIDER_TOKEN).useValue(embedder)
      .overrideProvider(KNOWLEDGE_STORE_TOKEN).useValue(store)
      .overrideProvider(INGEST_USE_CASE).useValue(new IngestDocumentUseCase(embedder, store, cfg))
      .overrideProvider(ASK_USE_CASE).useValue(ask)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
    // Boots the full AppModule (key generation + knowledge seed): under `pnpm -r` parallel load the
    // default 5 s hook timeout was intermittently exceeded.
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('401 without JWT; 200 with mock provider, sources and tokens; 403 without agent:ask/agent:ingest; tool with users:read', async () => {
    await request(app.getHttpServer()).post('/agent/ask').send({ question: 'hola' }).expect(401);

    const auditor = await sign(['auditor'], ['audit:read']);
    await request(app.getHttpServer())
      .post('/agent/ask')
      .set('Authorization', `Bearer ${auditor}`)
      .send({ question: 'Como cierro sesion?' })
      .expect(403);

    const viewer = await sign(['operador'], ['agent:ask']);
    const ok = await request(app.getHttpServer())
      .post('/agent/ask')
      .set('Authorization', `Bearer ${viewer}`)
      .send({ question: 'Como cierro sesion?' })
      .expect(200);
    expect(ok.body.meta.provider).toBe('mock');
    expect(ok.body.sources.length).toBeGreaterThan(0);
    expect(ok.body.meta.tokensIn).toBeGreaterThan(0);
    expect(ok.body.degraded).toBe(false);

    await request(app.getHttpServer()).post('/agent/ask').set('Authorization', `Bearer ${viewer}`).send({ question: '' }).expect(400);
    await request(app.getHttpServer())
      .post('/agent/ingest')
      .set('Authorization', `Bearer ${viewer}`)
      .send({ docId: 'x', source: 's', roleScope: ['all'], text: 't' })
      .expect(403);

    lookup.mockResolvedValueOnce([{ id: '1', name: 'Ana', roleId: 'r', status: 'active' }]);
    const admin = await sign(['operador'], ['agent:ask', 'users:read']);
    const withTool = await request(app.getHttpServer())
      .post('/agent/ask')
      .set('Authorization', `Bearer ${admin}`)
      .send({ question: 'Cuantos usuarios hay?' })
      .expect(200);
    expect(withTool.body.meta.toolCalls).toBeGreaterThanOrEqual(1);

    lookup.mockRejectedValueOnce(new UserToolUnavailableError('forbidden', 403));
    const denied = await request(app.getHttpServer())
      .post('/agent/ask')
      .set('Authorization', `Bearer ${admin}`)
      .send({ question: 'Cuantos usuarios hay?' })
      .expect(200);
    expect(denied.body.meta.toolCalls).toBe(0);
    expect(denied.body.degraded).toBe(false);
  });
});
