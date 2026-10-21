/** Puerto de solo lectura sobre el denylist de revocaciones. */
export interface DenylistReader {
  /** true si existe `auth:deny:jti:{jti}`. */
  isJtiDenied(jti: string): Promise<boolean>;
  /** Epoch en segundos de `auth:deny:user:{sub}`, o null si no existe. */
  getUserDenyEpoch(sub: string): Promise<number | null>;
}

/** Subconjunto de ioredis que necesitamos (solo lectura). */
export interface RedisLikeClient {
  exists(key: string): Promise<number>;
  get(key: string): Promise<string | null>;
}

export class RedisDenylistReader implements DenylistReader {
  constructor(private readonly client: RedisLikeClient) {}

  async isJtiDenied(jti: string): Promise<boolean> {
    return (await this.client.exists(`auth:deny:jti:${jti}`)) > 0;
  }

  async getUserDenyEpoch(sub: string): Promise<number | null> {
    const raw = await this.client.get(`auth:deny:user:${sub}`);
    if (raw === null || raw === undefined) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
}
