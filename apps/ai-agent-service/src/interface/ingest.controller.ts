import { Body, Controller, ForbiddenException, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@toka/jwt-guard';
import type { AuthenticatedUser } from '@toka/jwt-guard';
import type { IngestDocumentUseCase } from '../application/ingest/ingest-document.use-case';
import type { AgentConfig } from '../config/config';
import { IngestDto } from './dto';
import { AGENT_CONFIG, INGEST_USE_CASE } from './tokens';

@Controller('agent')
@UseGuards(JwtAuthGuard)
export class IngestController {
  constructor(
    @Inject(INGEST_USE_CASE) private readonly ingest: IngestDocumentUseCase,
    @Inject(AGENT_CONFIG) private readonly cfg: AgentConfig,
  ) {}

  @Post('ingest')
  @HttpCode(200)
  async handle(
    @Body() dto: IngestDto,
    @Req() req: { user: AuthenticatedUser },
  ): Promise<{ docId: string; chunks: number }> {
    if (!req.user.roles.includes(this.cfg.adminRole)) throw new ForbiddenException('Admin role required');
    const chunks = await this.ingest.ingest(dto);
    return { docId: dto.docId, chunks };
  }
}
