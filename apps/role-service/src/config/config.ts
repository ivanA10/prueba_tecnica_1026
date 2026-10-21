export interface RoleConfig {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  rabbitmqUrl: string;
  authJwksUrl: string;
  jwtIssuer: string;
  cacheTtlSeconds: number;
  adminRoleId: string;
  operadorRoleId: string;
  auditorRoleId: string;
  publishRetries: number;
}

export const DEFAULT_ADMIN_ROLE_ID = '00000000-0000-4000-8000-000000000001';
export const DEFAULT_OPERADOR_ROLE_ID = '00000000-0000-4000-8000-000000000002';
export const DEFAULT_AUDITOR_ROLE_ID = '00000000-0000-4000-8000-000000000003';

function required(env: NodeJS.ProcessEnv, name: string): string {
  const v = env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

function int(env: NodeJS.ProcessEnv, name: string, def: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`Invalid integer for ${name}`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RoleConfig {
  return {
    port: int(env, 'PORT', 3003),
    databaseUrl: required(env, 'DATABASE_URL'),
    redisUrl: required(env, 'REDIS_URL'),
    rabbitmqUrl: required(env, 'RABBITMQ_URL'),
    authJwksUrl: required(env, 'AUTH_JWKS_URL'),
    jwtIssuer: env.JWT_ISSUER || 'toka-auth',
    cacheTtlSeconds: int(env, 'ROLE_CACHE_TTL_SECONDS', 300),
    adminRoleId: env.ADMIN_ROLE_ID || DEFAULT_ADMIN_ROLE_ID,
    operadorRoleId: env.OPERADOR_ROLE_ID || DEFAULT_OPERADOR_ROLE_ID,
    auditorRoleId: env.AUDITOR_ROLE_ID || DEFAULT_AUDITOR_ROLE_ID,
    publishRetries: int(env, 'PUBLISH_RETRIES', 3),
  };
}
