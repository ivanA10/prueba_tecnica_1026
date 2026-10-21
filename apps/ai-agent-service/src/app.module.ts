import { Inject, Logger as NestLogger, Module, OnModuleInit } from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';
import { JWT_GUARD_OPTIONS, JwtAuthGuard, RedisDenylistReader } from '@toka/jwt-guard';
import type { JwtGuardOptions } from '@toka/jwt-guard';
import { createLogger } from '@toka/logger';
import Redis from 'ioredis';
import { AskAgentUseCase } from './application/ask/ask-agent.use-case';
import { IngestDocumentUseCase } from './application/ingest/ingest-document.use-case';
import { seedKnowledge } from './application/ingest/seed-loader';
import type { EmbeddingProvider } from './application/ports/embedding-provider.port';
import type { KnowledgeStore } from './application/ports/knowledge-store.port';
import { AgentConfig, loadConfig } from './config/config';
import { createEmbeddingProvider } from './infrastructure/embeddings/embedding.factory';
import { createLlmProvider } from './infrastructure/llm/provider.factory';
import { LoggerMetricsRecorder } from './infrastructure/metrics/logger-metrics.recorder';
import { QdrantClientLike, QdrantKnowledgeStore } from './infrastructure/qdrant/qdrant.knowledge-store';
import { RedisRateLimiter } from './infrastructure/redis/redis-rate-limiter';
import { HttpUserDirectoryGateway } from './infrastructure/user-client/user-directory.gateway';
import { AskController } from './interface/ask.controller';
import { HealthController } from './interface/health.controller';
import { IngestController } from './interface/ingest.controller';
import { RateLimitGuard } from './interface/rate-limit.guard';
import { RequestLogInterceptor } from './interface/request-log.interceptor';
import {
  AGENT_CONFIG,
  ASK_USE_CASE,
  EMBEDDING_PROVIDER_TOKEN,
  INGEST_USE_CASE,
  KNOWLEDGE_STORE_TOKEN,
  LOGGER,
  RATE_LIMITER,
  REDIS,
} from './interface/tokens';

type Logger = ReturnType<typeof createLogger>;

export class KnowledgeBootstrap implements OnModuleInit {
  constructor(
    @Inject(AGENT_CONFIG) private readonly cfg: AgentConfig,
    @Inject(KNOWLEDGE_STORE_TOKEN) private readonly store: KnowledgeStore,
    @Inject(INGEST_USE_CASE) private readonly ingest: IngestDocumentUseCase,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.store.ensureCollection();
      if (this.cfg.seedOnStart) {
        const n = await seedKnowledge(this.cfg.knowledgeDir, this.ingest);
        this.logger.info({ docs: n }, 'knowledge seed ingested');
      }
    } catch (err) {
      new NestLogger('KnowledgeBootstrap').error(`knowledge bootstrap failed: ${(err as Error).message}`);
    }
  }
}

@Module({
  controllers: [AskController, IngestController, HealthController],
  providers: [
    { provide: AGENT_CONFIG, useFactory: () => loadConfig() },
    { provide: LOGGER, useFactory: () => createLogger({ service: 'ai-agent-service' }) },
    {
      provide: REDIS,
      inject: [AGENT_CONFIG],
      useFactory: (cfg: AgentConfig) =>
        new Redis(cfg.redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false }),
    },
    {
      provide: JWT_GUARD_OPTIONS,
      inject: [AGENT_CONFIG, REDIS, LOGGER],
      useFactory: (cfg: AgentConfig, redis: Redis, logger: Logger): JwtGuardOptions => ({
        issuer: cfg.jwtIssuer,
        audience: cfg.jwtAudience,
        jwksUri: cfg.jwksUri,
        denylist: new RedisDenylistReader(redis),
        logger,
      }),
    },
    {
      provide: RATE_LIMITER,
      inject: [REDIS, LOGGER],
      useFactory: (redis: Redis, logger: Logger) => new RedisRateLimiter(redis, logger),
    },
    {
      provide: EMBEDDING_PROVIDER_TOKEN,
      inject: [AGENT_CONFIG],
      useFactory: (cfg: AgentConfig) =>
        createEmbeddingProvider(process.env.EMBEDDING_PROVIDER ?? 'onnx', cfg.embeddingModelDir),
    },
    {
      provide: KNOWLEDGE_STORE_TOKEN,
      inject: [AGENT_CONFIG],
      useFactory: (cfg: AgentConfig) =>
        new QdrantKnowledgeStore(
          // checkCompatibility off: the Qdrant server version is pinned in docker-compose.yml.
          new QdrantClient({ url: cfg.qdrantUrl, checkCompatibility: false }) as unknown as QdrantClientLike,
        ),
    },
    {
      provide: INGEST_USE_CASE,
      inject: [EMBEDDING_PROVIDER_TOKEN, KNOWLEDGE_STORE_TOKEN, AGENT_CONFIG],
      useFactory: (e: EmbeddingProvider, s: KnowledgeStore, cfg: AgentConfig) => new IngestDocumentUseCase(e, s, cfg),
    },
    {
      provide: ASK_USE_CASE,
      inject: [EMBEDDING_PROVIDER_TOKEN, KNOWLEDGE_STORE_TOKEN, AGENT_CONFIG, LOGGER],
      useFactory: (e: EmbeddingProvider, s: KnowledgeStore, cfg: AgentConfig, logger: Logger) =>
        new AskAgentUseCase({
          embedder: e,
          store: s,
          llm: createLlmProvider(cfg),
          users: new HttpUserDirectoryGateway({ baseUrl: cfg.userServiceUrl, timeoutMs: cfg.userToolTimeoutMs }),
          metrics: new LoggerMetricsRecorder(logger),
          logger,
          settings: cfg,
          priceEnv: { LLM_PRICE_INPUT_PER_MTOK: cfg.llmPriceInput, LLM_PRICE_OUTPUT_PER_MTOK: cfg.llmPriceOutput },
        }),
    },
    JwtAuthGuard,
    RateLimitGuard,
    RequestLogInterceptor,
    KnowledgeBootstrap,
  ],
})
export class AppModule {}
