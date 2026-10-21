import { Inject, Injectable, Module, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { JWT_GUARD_OPTIONS, JwtAuthGuard, PermissionsGuard, RedisDenylistReader } from '@toka/jwt-guard';
import { createLogger } from '@toka/logger';
import { PrismaClient } from './generated/prisma';
import { TOKENS } from './application/ports';
import { ResilientEventPublisher } from './application/resilient-publisher';
import { RoleService } from './application/role-service';
import { RoleConfig, loadConfig } from './config/config';
import { AmqpPublisher } from './infrastructure/messaging/amqp';
import { PrismaRoleRepository } from './infrastructure/persistence/prisma-role-repository';
import { RedisRoleCache } from './infrastructure/redis/redis-role-cache';
import { HealthController, READINESS, RolesController } from './interfaces/http/controllers';

const PRISMA = 'PRISMA';
const REDIS = 'REDIS';
const BROKER = 'BROKER';

/** Readiness probes must answer within the healthcheck timeout even if a dependency hangs. */
const within = (p: Promise<boolean>, ms = 1500): Promise<boolean> =>
  Promise.race([p, new Promise<boolean>((r) => setTimeout(() => r(false), ms).unref())]);

type Log = { warn(o: Record<string, unknown>, m?: string): void; info(o: Record<string, unknown>, m?: string): void };

@Injectable()
class Lifecycle implements OnApplicationBootstrap, OnModuleDestroy {
  constructor(
    @Inject(BROKER) private readonly broker: AmqpPublisher,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(TOKENS.Config) private readonly config: RoleConfig,
    @Inject(TOKENS.Logger) private readonly logger: Log,
    private readonly roles: RoleService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.broker.start();
    // Seeds and re-sync publish role.* events: wait for the broker so they are not dropped at boot.
    if (!(await this.broker.whenReady(30000))) {
      this.logger.warn({ event: 'amqp.not_ready' }, 'broker not ready after 30s; seeding anyway (re-sync will retry)');
    }
    await this.roles.seedAdmin(this.config.adminRoleId);
    await this.roles.seedExampleRoles(this.config.operadorRoleId, this.config.auditorRoleId);
    // Non-blocking re-sync: a broker outage only produces warnings.
    void this.roles
      .resync()
      .then((n) => this.logger.info({ event: 'role.resync', count: n }, 'role re-sync done'))
      .catch((e) => this.logger.warn({ event: 'role.resync.failed', error: String(e) }, 'role re-sync failed'));
  }

  async onModuleDestroy(): Promise<void> {
    await this.broker.stop();
    await this.prisma.$disconnect();
    this.redis.disconnect();
  }
}

@Module({
  controllers: [RolesController, HealthController],
  providers: [
    { provide: TOKENS.Config, useFactory: () => loadConfig() },
    { provide: TOKENS.Logger, useFactory: () => createLogger({ service: 'role-service' }) },
    {
      provide: PRISMA,
      inject: [TOKENS.Config],
      useFactory: (c: RoleConfig) => new PrismaClient({ datasources: { db: { url: c.databaseUrl } } }),
    },
    {
      provide: REDIS,
      inject: [TOKENS.Config, TOKENS.Logger],
      useFactory: (c: RoleConfig, log: Log) => {
        const client = new Redis(c.redisUrl, { maxRetriesPerRequest: 2 });
        client.on('error', (e) => log.warn({ event: 'redis.error', error: e.message }, 'redis error'));
        return client;
      },
    },
    { provide: TOKENS.Roles, inject: [PRISMA], useFactory: (p: PrismaClient) => new PrismaRoleRepository(p) },
    {
      provide: TOKENS.Cache,
      inject: [REDIS, TOKENS.Config, TOKENS.Logger],
      useFactory: (r: Redis, c: RoleConfig, log: Log) => new RedisRoleCache(r, c.cacheTtlSeconds, log),
    },
    {
      provide: BROKER,
      inject: [TOKENS.Config, TOKENS.Logger],
      useFactory: (c: RoleConfig, log: Log) => new AmqpPublisher(c.rabbitmqUrl, log),
    },
    {
      provide: TOKENS.Publisher,
      inject: [BROKER, TOKENS.Logger, TOKENS.Config],
      useFactory: (b: AmqpPublisher, log: Log, c: RoleConfig) => new ResilientEventPublisher(b, log, c.publishRetries),
    },
    {
      provide: READINESS,
      inject: [PRISMA, REDIS, BROKER],
      useFactory: (prisma: PrismaClient, redis: Redis, broker: AmqpPublisher) => async () => ({
        postgres: await within(prisma.$queryRaw`SELECT 1`.then(() => true, () => false)),
        redis: await within(redis.ping().then((r) => r === 'PONG', () => false)),
        rabbitmq: broker.isReady(),
      }),
    },
    {
      provide: JWT_GUARD_OPTIONS,
      inject: [REDIS, TOKENS.Logger, TOKENS.Config],
      useFactory: (redis: Redis, logger: Log, c: RoleConfig) => ({
        issuer: c.jwtIssuer,
        audience: ['toka-api', 'role-service'],
        jwksUri: c.authJwksUrl,
        denylist: new RedisDenylistReader(redis),
        logger,
      }),
    },
    JwtAuthGuard,
    PermissionsGuard,
    RoleService,
    Lifecycle,
  ],
})
export class AppModule {}
