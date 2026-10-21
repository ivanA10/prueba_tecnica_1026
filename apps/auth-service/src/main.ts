import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AccessDeniedExceptionFilter, RequestLoggingInterceptor, correlationIdMiddleware } from '@toka/logger';
import { AppModule } from './app.module';
import { TOKENS } from './application/ports';
import type { AuthConfig } from './config/config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  const logger = app.get(TOKENS.Logger);
  const config = app.get<AuthConfig>(TOKENS.Config);
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(correlationIdMiddleware);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AccessDeniedExceptionFilter(logger));
  app.useGlobalInterceptors(new RequestLoggingInterceptor(logger));
  app.enableShutdownHooks();
  await app.listen(config.port, '0.0.0.0');
  logger.info({ event: 'service.started', port: config.port }, 'auth-service listening');
}

void bootstrap();
