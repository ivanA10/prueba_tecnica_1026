import type { JWTVerifyGetKey } from 'jose';
import type { DenylistReader } from './denylist';

export const JWT_GUARD_OPTIONS = 'TOKA_JWT_GUARD_OPTIONS';
export const DEFAULT_DENYLIST_TIMEOUT_MS = 200;

/** Logger con forma pino: `warn(obj, msg)`. */
export interface GuardLogger {
  warn(obj: Record<string, unknown>, msg?: string): void;
}

export interface GuardMetrics {
  increment(name: string): void;
}

export interface JwtGuardOptions {
  issuer: string;
  audience: string | string[];
  /** URL del JWKS (cache en memoria via createRemoteJWKSet). Ignorado si hay `keyResolver`. */
  jwksUri?: string;
  /** Resolvedor de claves alternativo (p. ej. createLocalJWKSet en pruebas). */
  keyResolver?: JWTVerifyGetKey;
  denylist: DenylistReader;
  /** Por defecto 200 ms. */
  denylistTimeoutMs?: number;
  logger: GuardLogger;
  metrics?: GuardMetrics;
}

export interface AuthenticatedUser {
  sub: string;
  roles: string[];
  permissions: string[];
  jti: string;
  iat: number;
  exp: number;
  aud: string | string[];
}
