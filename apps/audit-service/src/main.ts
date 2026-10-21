import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import {
  AccessDeniedExceptionFilter,
  RequestLoggingInterceptor,
  correlationIdMiddleware,
  createLogger,
} from '@toka/logger';
import { AppModule } from './app.module';
import { loadConfig } from './config';
import { LOGGER, PinoNestLogger } from './logging';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get<ReturnType<typeof createLogger>>(LOGGER);
  app.useLogger(new PinoNestLogger(logger));
  app.use(helmet());
  app.use(correlationIdMiddleware);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AccessDeniedExceptionFilter(logger));
  app.useGlobalInterceptors(new RequestLoggingInterceptor(logger));
  app.enableShutdownHooks();
  const { port } = loadConfig();
  await app.listen(port, '0.0.0.0');
  logger.info({ event: 'service.started', port }, 'audit-service listening');
}

void bootstrap();
