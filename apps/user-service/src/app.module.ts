import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { connect } from 'amqplib';
import Redis from 'ioredis';
import { createHttpClient } from '@toka/http-client';
import { JWT_GUARD_OPTIONS, JwtAuthGuard, RedisDenylistReader } from '@toka/jwt-guard';
import { createLogger } from '@toka/logger';
import { HttpAuthClient, HttpRoleClient, ServiceTokenProvider } from './clients';
import { loadConfig } from './config';
import { HealthController } from './health.controller';
import { AdminSeedService, ReconcileScheduler } from './lifecycle';
import { AmqpConnect, AmqpEventPublisher, EVENT_PUBLISHER, OutboxPublisher } from './outbox.publisher';
import { PrismaClient } from './generated/prisma';
import { AUTH_CLIENT, ROLE_CLIENT, USER_REPOSITORY } from './ports';
import { PrismaService } from './prisma.service';
import { UsersController } from './users.controller';
import { PrismaUserRepository } from './users.repository';
import { CLOCK, USER_CONFIG, UsersService } from './users.service';

export const LOGGER = 'LOGGER';
const config = loadConfig();

@Module({
  controllers: [UsersController, HealthController],
  providers: [
    { provide: USER_CONFIG, useValue: config },
    { provide: CLOCK, useValue: Date.now },
    { provide: LOGGER, useValue: createLogger({ service: 'user-service' }) },
    { provide: PrismaClient, useClass: PrismaService },
    {
      provide: USER_REPOSITORY,
      inject: [PrismaClient],
      useFactory: (prisma: PrismaClient) => new PrismaUserRepository(prisma),
    },
    {
      provide: ServiceTokenProvider,
      useFactory: () =>
        new ServiceTokenProvider(
          createHttpClient({ baseUrl: config.authBaseUrl, timeoutMs: config.authTimeoutMs }),
          config.svcClientId,
          config.svcClientSecret,
        ),
    },
    {
      provide: ROLE_CLIENT,
      inject: [ServiceTokenProvider],
      useFactory: (tokens: ServiceTokenProvider) =>
        new HttpRoleClient(
          createHttpClient({
            baseUrl: config.roleBaseUrl,
            timeoutMs: config.roleTimeoutMs,
            retries: 2,
            backoffBaseMs: 200,
            budgetMs: config.signupBudgetMs,
            breaker: { failureThreshold: 5, resetTimeoutMs: 10000 },
          }),
          tokens,
        ),
    },
    {
      provide: AUTH_CLIENT,
      inject: [ServiceTokenProvider],
      useFactory: (tokens: ServiceTokenProvider) =>
        new HttpAuthClient(
          createHttpClient({
            baseUrl: config.authBaseUrl,
            timeoutMs: config.authTimeoutMs,
            retries: 3,
            backoffBaseMs: 250,
            budgetMs: config.signupBudgetMs,
            breaker: { failureThreshold: 5, resetTimeoutMs: 10000 },
          }),
          tokens,
        ),
    },
    {
      provide: EVENT_PUBLISHER,
      useFactory: () => new AmqpEventPublisher(config.rabbitmqUrl, connect as unknown as AmqpConnect),
    },
    {
      provide: JWT_GUARD_OPTIONS,
      inject: [LOGGER],
      useFactory: (logger: ReturnType<typeof createLogger>) => {
        const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
        redis.on('error', () => undefined);
        return {
          issuer: 'toka-auth',
          audience: 'toka-api',
          jwksUri: config.jwksUri,
          denylist: new RedisDenylistReader(redis),
          logger,
        };
      },
    },
    Reflector,
    JwtAuthGuard,
    UsersService,
    OutboxPublisher,
    ReconcileScheduler,
    AdminSeedService,
  ],
})
export class AppModule {}
