export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  hit(key: string, max: number, windowSeconds: number): Promise<RateLimitResult>;
}
