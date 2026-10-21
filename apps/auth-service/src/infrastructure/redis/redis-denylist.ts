import type Redis from 'ioredis';
import type { DenylistWriter } from '../../application/ports';

export class RedisDenylistWriter implements DenylistWriter {
  constructor(private readonly client: Redis) {}

  async denyJti(jti: string, ttlSeconds: number): Promise<void> {
    await this.client.set(`auth:deny:jti:${jti}`, '1', 'EX', Math.max(1, ttlSeconds));
  }

  async denyUser(userId: string, epochSeconds: number, ttlSeconds: number): Promise<void> {
    await this.client.set(`auth:deny:user:${userId}`, String(epochSeconds), 'EX', Math.max(1, ttlSeconds));
  }
}
