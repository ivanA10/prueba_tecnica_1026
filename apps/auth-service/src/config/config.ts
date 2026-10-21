export interface ServiceClient {
  id: string;
  secret: string;
}

export interface AuthConfig {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  rabbitmqUrl: string;
  jwtPrivateKeyPath: string;
  jwtKid: string;
  jwtIssuer: string;
  accessTokenTtl: number;
  refreshTokenTtl: number;
  serviceTokenTtl: number;
  cookieSecure: boolean;
  serviceClients: ServiceClient[];
  /** Audiences a client_credentials token may target (internal services only). */
  serviceAudiences: string[];
  retryDelaysMs: number[];
  maxRetries: number;
  publishRetries: number;
}

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

export function parseServiceClients(raw: string): ServiceClient[] {
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf(':');
      if (idx <= 0 || idx === pair.length - 1) throw new Error('Invalid SERVICE_CLIENTS entry');
      return { id: pair.slice(0, idx), secret: pair.slice(idx + 1) };
    });
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const clients = parseServiceClients(required(env, 'SERVICE_CLIENTS'));
  if (env.SVC_CLIENT_ID && env.SVC_CLIENT_SECRET && !clients.some((c) => c.id === env.SVC_CLIENT_ID)) {
    clients.push({ id: env.SVC_CLIENT_ID, secret: env.SVC_CLIENT_SECRET });
  }
  return {
    port: int(env, 'PORT', 3001),
    databaseUrl: required(env, 'DATABASE_URL'),
    redisUrl: required(env, 'REDIS_URL'),
    rabbitmqUrl: required(env, 'RABBITMQ_URL'),
    jwtPrivateKeyPath: required(env, 'JWT_PRIVATE_KEY_PATH'),
    jwtKid: env.JWT_KID || 'toka-key-1',
    jwtIssuer: env.JWT_ISSUER || 'toka-auth',
    accessTokenTtl: int(env, 'ACCESS_TOKEN_TTL_SECONDS', 900),
    refreshTokenTtl: int(env, 'REFRESH_TOKEN_TTL_SECONDS', 604800),
    serviceTokenTtl: int(env, 'SERVICE_TOKEN_TTL_SECONDS', 300),
    cookieSecure: (env.COOKIE_SECURE ?? 'true') !== 'false',
    serviceClients: clients,
    serviceAudiences: (env.SERVICE_AUDIENCES || 'auth-service,role-service')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && s !== 'toka-api'),
    retryDelaysMs: (env.RETRY_DELAYS_MS ?? '5000,30000,120000').split(',').map((s) => Number(s.trim())),
    maxRetries: int(env, 'MAX_RETRIES', 3),
    publishRetries: int(env, 'PUBLISH_RETRIES', 3),
  };
}
