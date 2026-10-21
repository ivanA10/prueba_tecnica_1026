import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AccessDeniedExceptionFilter, correlationIdMiddleware, createLogger } from '@toka/logger';
import { AppModule } from './app.module';
import { loadConfig } from './config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.use(correlationIdMiddleware);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AccessDeniedExceptionFilter(createLogger({ service: 'audit-service' })));
  app.enableShutdownHooks();
  await app.listen(loadConfig().port, '0.0.0.0');
}

void bootstrap();
