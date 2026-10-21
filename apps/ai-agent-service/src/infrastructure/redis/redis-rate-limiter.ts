import type { RateLimitResult, RateLimiter } from '../../application/ports/rate-limiter.port';

export interface RedisRlClient {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
}

export interface WarnLogger {
  warn(obj: Record<string, unknown>, msg?: string): void;
}

/** Fixed-window counter `agent:rl:*`. Fails open when Redis is unavailable. */
export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly redis: RedisRlClient,
    private readonly logger: WarnLogger,
  ) {}

  async hit(key: string, max: number, windowSeconds: number): Promise<RateLimitResult> {
    const k = `agent:rl:${key}`;
    try {
      const n = await this.redis.incr(k);
      if (n === 1) await this.redis.expire(k, windowSeconds);
      if (n <= max) return { allowed: true, retryAfterSeconds: 0 };
      const ttl = await this.redis.ttl(k);
      return { allowed: false, retryAfterSeconds: ttl > 0 ? ttl : windowSeconds };
    } catch (err) {
      this.logger.warn({ event: 'ratelimit.unavailable', error: (err as Error).message }, 'rate limiter failing open');
      return { allowed: true, retryAfterSeconds: 0 };
    }
  }
}
