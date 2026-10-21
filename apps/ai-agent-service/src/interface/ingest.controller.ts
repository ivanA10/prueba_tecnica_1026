import { Body, Controller, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import { PERMISSIONS } from '@toka/contracts';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@toka/jwt-guard';
import type { IngestDocumentUseCase } from '../application/ingest/ingest-document.use-case';
import { IngestDto } from './dto';
import { INGEST_USE_CASE } from './tokens';

@Controller('agent')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class IngestController {
  constructor(@Inject(INGEST_USE_CASE) private readonly ingest: IngestDocumentUseCase) {}

  @Post('ingest')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.AGENT_INGEST)
  async handle(@Body() dto: IngestDto): Promise<{ docId: string; chunks: number }> {
    const chunks = await this.ingest.ingest(dto);
    return { docId: dto.docId, chunks };
  }
}
