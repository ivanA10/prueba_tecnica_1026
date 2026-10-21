import type Redis from 'ioredis';
import type { RoleCache } from '../../application/ports';
import type { Role } from '../../domain/role';

interface Warn {
  warn(obj: Record<string, unknown>, msg?: string): void;
}

/** Cache-aside `role:perm:{roleId}`; Redis failures degrade to DB reads (cache is not critical). */
export class RedisRoleCache implements RoleCache {
  constructor(
    private readonly client: Redis,
    private readonly ttlSeconds: number,
    private readonly logger: Warn,
  ) {}

  private key(id: string): string {
    return `role:perm:${id}`;
  }

  async get(id: string): Promise<Role | null> {
    try {
      const raw = await this.client.get(this.key(id));
      return raw ? (JSON.parse(raw) as Role) : null;
    } catch (e) {
      this.logger.warn({ event: 'role.cache.unavailable', error: String(e) }, 'cache read failed');
      return null;
    }
  }

  async set(role: Role): Promise<void> {
    try {
      await this.client.set(this.key(role.id), JSON.stringify(role), 'EX', this.ttlSeconds);
    } catch (e) {
      this.logger.warn({ event: 'role.cache.unavailable', error: String(e) }, 'cache write failed');
    }
  }

  async del(id: string): Promise<void> {
    try {
      await this.client.del(this.key(id));
    } catch (e) {
      this.logger.warn({ event: 'role.cache.unavailable', error: String(e) }, 'cache invalidation failed');
    }
  }
}
