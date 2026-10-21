import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { connect } from 'amqplib';
import Redis from 'ioredis';
import mongoose from 'mongoose';
import { JWT_GUARD_OPTIONS, JwtAuthGuard, RedisDenylistReader } from '@toka/jwt-guard';
import { createLogger } from '@toka/logger';
import { AUDIT_CONFIG, AMQP_CONNECT, AmqpConnect, AuditConsumer } from './audit.consumer';
import { AuditController, MONGO_READY } from './audit.controller';
import { AUDIT_OPTIONS, AUDIT_REPOSITORY, AuditDocument, AuditProcessor } from './audit.processor';
import { MongoAuditRepository } from './audit.repository';
import { AuditEventSchema } from './audit.schema';
import { loadConfig } from './config';
import { LOGGER } from './logging';

const config = loadConfig();
const connection = mongoose.createConnection(config.mongoUrl);
connection.on('error', () => undefined);

@Module({
  controllers: [AuditController],
  providers: [
    { provide: AUDIT_CONFIG, useValue: config },
    { provide: LOGGER, useValue: createLogger({ service: 'audit-service' }) },
    { provide: AUDIT_OPTIONS, useValue: { maxRetries: config.maxRetries } },
    { provide: AMQP_CONNECT, useValue: connect as unknown as AmqpConnect },
    { provide: MONGO_READY, useValue: () => connection.readyState === 1 },
    {
      provide: AUDIT_REPOSITORY,
      useFactory: () => new MongoAuditRepository(connection.model<AuditDocument>('AuditEvent', AuditEventSchema)),
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
    AuditProcessor,
    AuditConsumer,
  ],
})
export class AppModule {}
