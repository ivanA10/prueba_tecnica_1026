import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';
import type { JWTPayload, JWTVerifyGetKey } from 'jose';
import {
  AuthenticatedUser,
  DEFAULT_DENYLIST_TIMEOUT_MS,
  JWT_GUARD_OPTIONS,
  JwtGuardOptions,
} from './options';

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly getKey: JWTVerifyGetKey;
  private readonly timeoutMs: number;

  constructor(@Inject(JWT_GUARD_OPTIONS) private readonly options: JwtGuardOptions) {
    let base: JWTVerifyGetKey;
    if (options.keyResolver) {
      base = options.keyResolver;
    } else if (options.jwksUri) {
      base = createRemoteJWKSet(new URL(options.jwksUri));
    } else {
      throw new Error('JwtGuardOptions requires jwksUri or keyResolver');
    }
    this.getKey = this.withLastGoodKeys(base);
    this.timeoutMs = options.denylistTimeoutMs ?? DEFAULT_DENYLIST_TIMEOUT_MS;
  }

  /** Caches resolved keys by kid; if a later resolution fails, falls back to the last good key. */
  private withLastGoodKeys(resolver: JWTVerifyGetKey): JWTVerifyGetKey {
    const cache = new Map<string, Awaited<ReturnType<JWTVerifyGetKey>>>();
    return async (protectedHeader, token) => {
      const kid = protectedHeader.kid;
      try {
        const key = await resolver(protectedHeader, token);
        if (kid) cache.set(kid, key);
        return key;
      } catch (err) {
        const cached = kid ? cache.get(kid) : undefined;
        if (!cached) throw err;
        this.options.logger.warn(
          { event: 'jwks.refresh_failed', kid, error: err instanceof Error ? err.message : String(err) },
          'JWKS resolution failed, using cached key',
        );
        return cached;
      }
    };
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestLike>();
    const token = this.extractBearer(req);

    let payload: JWTPayload;
    try {
      const header = decodeProtectedHeader(token);
      if (header.alg !== 'RS256' || !header.kid) throw new Error('invalid header');
      ({ payload } = await jwtVerify(token, this.getKey, {
        algorithms: ['RS256'],
        issuer: this.options.issuer,
        audience: this.options.audience,
      }));
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    const { sub, jti, iat, exp, aud } = payload;
    if (!sub || !jti || iat === undefined || exp === undefined || aud === undefined) {
      throw new UnauthorizedException('Invalid token');
    }

    await this.checkDenylist(sub, jti, iat);

    const roles = Array.isArray(payload.roles) ? (payload.roles as string[]) : [];
    const permissions = Array.isArray(payload.permissions) ? (payload.permissions as string[]) : [];
    const scope = typeof payload.scope === 'string' ? payload.scope.split(' ').filter(Boolean) : [];
    req.user = { sub, roles, permissions, scope, jti, iat, exp, aud };
    return true;
  }

  private extractBearer(req: RequestLike): string {
    const raw = req.headers['authorization'];
    const value = Array.isArray(raw) ? raw[0] : raw;
    const match = value ? /^Bearer\s+(\S+)$/i.exec(value) : null;
    if (!match) throw new UnauthorizedException('Missing bearer token');
    return match[1];
  }

  private async checkDenylist(sub: string, jti: string, iat: number): Promise<void> {
    const { denylist } = this.options;
    let timer: NodeJS.Timeout | undefined;
    let jtiDenied: boolean;
    let userEpoch: number | null;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('denylist timeout')), this.timeoutMs);
      });
      [jtiDenied, userEpoch] = await Promise.race([
        Promise.all([denylist.isJtiDenied(jti), denylist.getUserDenyEpoch(sub)]),
        timeout,
      ]);
    } catch (err) {
      this.options.logger.warn(
        { event: 'denylist.unavailable', error: err instanceof Error ? err.message : String(err) },
        'denylist unavailable, failing open',
      );
      this.options.metrics?.increment('jwt_guard_denylist_unavailable');
      return;
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (jtiDenied || (userEpoch !== null && iat < userEpoch)) {
      throw new UnauthorizedException('Token revoked');
    }
  }
}
