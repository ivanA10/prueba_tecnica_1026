import { readFileSync } from 'fs';
import { Inject, Injectable, Module, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { JWT_GUARD_OPTIONS, JwtAuthGuard, RedisDenylistReader } from '@toka/jwt-guard';
import { createLogger } from '@toka/logger';
import { PrismaClient } from './generated/prisma';
import { CredentialsService } from './application/credentials-service';
import { TOKENS } from './application/ports';
import { MessageProcessor, ProjectionHandler } from './application/projection-handler';
import { ResilientEventPublisher } from './application/resilient-publisher';
import { AuthService, ServiceTokenService } from './application/token-service';
import { AuthConfig, loadConfig } from './config/config';
import { Argon2Hasher, JoseTokenIssuer, SystemClock } from './infrastructure/crypto/crypto';
import { AmqpBroker } from './infrastructure/messaging/amqp';
import {
  PrismaCredentialRepository,
  PrismaProjectionRepository,
  PrismaRefreshTokenRepository,
} from './infrastructure/persistence/prisma-repositories';
import { RedisDenylistWriter } from './infrastructure/redis/redis-denylist';
import {
  AuthController,
  HealthController,
  InternalCredentialsController,
  JwksController,
  OAuthController,
} from './interfaces/http/controllers';
import { RolesGuard } from './interfaces/http/roles.guard';

const PRISMA = 'PRISMA';
const REDIS = 'REDIS';
const BROKER = 'BROKER';

@Injectable()
class Lifecycle implements OnApplicationBootstrap, OnModuleDestroy {
  constructor(
    @Inject(BROKER) private readonly broker: AmqpBroker,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(TOKENS.Config) private readonly config: AuthConfig,
    private readonly handler: ProjectionHandler,
  ) {}

  onApplicationBootstrap(): void {
    this.broker.setProcessor(
      new MessageProcessor(this.handler, { delaysMs: this.config.retryDelaysMs, maxRetries: this.config.maxRetries }),
    );
    this.broker.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.broker.stop();
    await this.prisma.$disconnect();
    this.redis.disconnect();
  }
}

@Module({
  controllers: [AuthController, OAuthController, JwksController, InternalCredentialsController, HealthController],
  providers: [
    { provide: TOKENS.Config, useFactory: () => loadConfig() },
    { provide: TOKENS.Logger, useFactory: () => createLogger({ service: 'auth-service' }) },
    { provide: TOKENS.Clock, useClass: SystemClock },
    { provide: TOKENS.Hasher, useClass: Argon2Hasher },
    {
      provide: TOKENS.Issuer,
      inject: [TOKENS.Config],
      useFactory: (c: AuthConfig) =>
        new JoseTokenIssuer(readFileSync(c.jwtPrivateKeyPath, 'utf8'), c.jwtKid, c.jwtIssuer),
    },
    {
      provide: PRISMA,
      inject: [TOKENS.Config],
      useFactory: (c: AuthConfig) => new PrismaClient({ datasources: { db: { url: c.databaseUrl } } }),
    },
    {
      provide: REDIS,
      inject: [TOKENS.Config, TOKENS.Logger],
      useFactory: (c: AuthConfig, log: { warn(o: object, m?: string): void }) => {
        const client = new Redis(c.redisUrl, { maxRetriesPerRequest: 2 });
        client.on('error', (e) => log.warn({ event: 'redis.error', error: e.message }, 'redis error'));
        return client;
      },
    },
    { provide: TOKENS.Credentials, inject: [PRISMA], useFactory: (p: PrismaClient) => new PrismaCredentialRepository(p) },
    { provide: TOKENS.Projection, inject: [PRISMA], useFactory: (p: PrismaClient) => new PrismaProjectionRepository(p) },
    { provide: TOKENS.RefreshTokens, inject: [PRISMA], useFactory: (p: PrismaClient) => new PrismaRefreshTokenRepository(p) },
    { provide: TOKENS.Denylist, inject: [REDIS], useFactory: (r: Redis) => new RedisDenylistWriter(r) },
    {
      provide: BROKER,
      inject: [TOKENS.Config, TOKENS.Logger],
      useFactory: (c: AuthConfig, log: ConstructorParameters<typeof AmqpBroker>[1]) => new AmqpBroker(c.rabbitmqUrl, log),
    },
    {
      provide: TOKENS.Publisher,
      inject: [BROKER, TOKENS.Logger, TOKENS.Config],
      useFactory: (b: AmqpBroker, log: { warn(o: object, m?: string): void }, c: AuthConfig) =>
        new ResilientEventPublisher(b, log as never, c.publishRetries),
    },
    {
      provide: JWT_GUARD_OPTIONS,
      inject: [TOKENS.Issuer, REDIS, TOKENS.Logger, TOKENS.Config],
      useFactory: (issuer: JoseTokenIssuer, redis: Redis, logger: never, c: AuthConfig) => ({
        issuer: c.jwtIssuer,
        audience: ['toka-api', 'auth-service'],
        keyResolver: issuer.keyResolver(),
        denylist: new RedisDenylistReader(redis),
        logger,
      }),
    },
    JwtAuthGuard,
    RolesGuard,
    AuthService,
    ServiceTokenService,
    CredentialsService,
    ProjectionHandler,
    Lifecycle,
  ],
})
export class AppModule {}
