import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { PrismaClient } from './generated/prisma';
import { EVENT_PUBLISHER, EventPublisher } from './outbox.publisher';

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaClient,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    const checks = { postgres: false, rabbitmq: false };
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.postgres = true;
    } catch {
      /* reported below */
    }
    checks.rabbitmq = await this.publisher.isReady();
    if (!checks.postgres || !checks.rabbitmq) throw new ServiceUnavailableException({ status: 'unavailable', checks });
    return { status: 'ready', checks };
  }
}
