import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@toka/jwt-guard';
import { AuditProcessor } from './audit.processor';
import { AuditConsumer } from './audit.consumer';
import { AuditQueryDto } from './dto/audit-query.dto';
import { Roles, RolesGuard } from './roles.guard';

export const MONGO_READY = 'MONGO_READY';

@Controller()
export class AuditController {
  constructor(
    private readonly audit: AuditProcessor,
    private readonly consumer: AuditConsumer,
    @Inject(MONGO_READY) private readonly mongoReady: () => boolean,
  ) {}

  @Get('audit/events')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async events(@Query() q: AuditQueryDto) {
    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;
    if (from && to && from > to) throw new BadRequestException('from must be <= to');
    try {
      return await this.audit.query({ actor: q.actor, type: q.type, from, to, page: q.page, limit: q.limit });
    } catch {
      throw new ServiceUnavailableException('audit store unavailable');
    }
  }

  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Get('ready')
  ready() {
    const checks = { mongo: this.mongoReady(), rabbitmq: this.consumer.isConnected() };
    if (!checks.mongo || !checks.rabbitmq) throw new ServiceUnavailableException({ status: 'unavailable', checks });
    return { status: 'ready', checks };
  }
}
