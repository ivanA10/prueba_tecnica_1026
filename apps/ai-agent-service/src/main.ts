import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { correlationIdMiddleware } from '@toka/logger';
import { AppModule } from './app.module';
import { loadConfig } from './config/config';
import { JSON_BODY_LIMIT } from './interface/body-limit';

async function bootstrap(): Promise<void> {
  const cfg = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.use(helmet());
  app.use(correlationIdMiddleware);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  await app.listen(cfg.port);
}

void bootstrap();
