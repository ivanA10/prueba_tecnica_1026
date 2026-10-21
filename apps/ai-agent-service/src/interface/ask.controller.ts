import { Body, Controller, HttpCode, Inject, Post, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '@toka/jwt-guard';
import type { AuthenticatedUser } from '@toka/jwt-guard';
import { getCorrelationId } from '@toka/logger';
import type { AskAgentUseCase } from '../application/ask/ask-agent.use-case';
import type { AgentResponse } from '../domain/agent-answer';
import { AskDto } from './dto';
import { RateLimitGuard } from './rate-limit.guard';
import { RequestLogInterceptor } from './request-log.interceptor';
import { ASK_USE_CASE } from './tokens';

@Controller('agent')
@UseGuards(JwtAuthGuard, RateLimitGuard)
@UseInterceptors(RequestLogInterceptor)
export class AskController {
  constructor(@Inject(ASK_USE_CASE) private readonly ask: AskAgentUseCase) {}

  @Post('ask')
  @HttpCode(200)
  async handle(
    @Body() dto: AskDto,
    @Req() req: { user: AuthenticatedUser; headers: Record<string, string | undefined> },
  ): Promise<AgentResponse> {
    return this.ask.ask({
      question: dto.question,
      roles: req.user.roles,
      authorization: req.headers['authorization'] ?? '',
      correlationId: getCorrelationId(),
    });
  }
}
