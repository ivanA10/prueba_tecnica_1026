const num = (v: string | undefined, d: number): number => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : d;
};

export interface AuditConfig {
  port: number;
  mongoUrl: string;
  rabbitmqUrl: string;
  redisUrl: string;
  jwksUri: string;
  retryTtlMs: number;
  maxRetries: number;
  prefetch: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AuditConfig {
  return {
    port: num(env.PORT, 3004),
    mongoUrl: env.MONGO_URL ?? 'mongodb://localhost:27017/audit_db',
    rabbitmqUrl: env.RABBITMQ_URL ?? 'amqp://localhost:5672',
    redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
    jwksUri: env.JWKS_URI ?? 'http://auth-service:3001/.well-known/jwks.json',
    retryTtlMs: num(env.AUDIT_RETRY_TTL_MS, 5000),
    maxRetries: num(env.AUDIT_MAX_RETRIES, 3),
    prefetch: num(env.AUDIT_PREFETCH, 10),
  };
}
