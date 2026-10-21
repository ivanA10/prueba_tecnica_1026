import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { RateLimiter } from '../application/ports/rate-limiter.port';
import type { AgentConfig } from '../config/config';
import { AGENT_CONFIG, RATE_LIMITER } from './tokens';

interface Req {
  user?: { sub: string };
  route?: { path?: string };
  url?: string;
}
interface Res {
  setHeader(name: string, value: string): unknown;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    @Inject(AGENT_CONFIG) private readonly cfg: AgentConfig,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const http = ctx.switchToHttp();
    const req = http.getRequest<Req>();
    const res = http.getResponse<Res>();
    const route = req.route?.path ?? req.url ?? 'unknown';
    const r = await this.limiter.hit(`${req.user?.sub ?? 'anon'}:${route}`, this.cfg.rlMax, this.cfg.rlWindowS);
    if (!r.allowed) {
      res.setHeader('Retry-After', String(r.retryAfterSeconds));
      throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
