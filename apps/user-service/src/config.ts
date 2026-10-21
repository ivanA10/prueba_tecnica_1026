const num = (v: string | undefined, d: number): number => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : d;
};

export interface UserConfig {
  port: number;
  rabbitmqUrl: string;
  redisUrl: string;
  jwksUri: string;
  authBaseUrl: string;
  roleBaseUrl: string;
  svcClientId: string;
  svcClientSecret: string;
  roleTimeoutMs: number;
  authTimeoutMs: number;
  signupBudgetMs: number;
  reconcileGraceMs: number;
  reconcileIntervalMs: number;
  outboxPollMs: number;
  outboxBatch: number;
  adminSeedEmail?: string;
  adminSeedPassword?: string;
  adminSeedRoleId: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): UserConfig {
  return {
    port: num(env.PORT, 3002),
    rabbitmqUrl: env.RABBITMQ_URL ?? 'amqp://localhost:5672',
    redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
    jwksUri: env.JWKS_URI ?? 'http://auth-service:3001/.well-known/jwks.json',
    authBaseUrl: env.AUTH_BASE_URL ?? 'http://auth-service:3001',
    roleBaseUrl: env.ROLE_BASE_URL ?? 'http://role-service:3003',
    svcClientId: env.SVC_CLIENT_ID ?? 'user-service',
    svcClientSecret: env.SVC_CLIENT_SECRET ?? '',
    roleTimeoutMs: num(env.ROLE_TIMEOUT_MS, 2000),
    authTimeoutMs: num(env.AUTH_TIMEOUT_MS, 3000),
    signupBudgetMs: num(env.SIGNUP_BUDGET_MS, 10000),
    reconcileGraceMs: num(env.RECONCILE_GRACE_MS, 60000),
    reconcileIntervalMs: num(env.RECONCILE_INTERVAL_MS, 30000),
    outboxPollMs: num(env.OUTBOX_POLL_MS, 1000),
    outboxBatch: num(env.OUTBOX_BATCH, 50),
    adminSeedEmail: env.ADMIN_SEED_EMAIL || undefined,
    adminSeedPassword: env.ADMIN_SEED_PASSWORD || undefined,
    adminSeedRoleId: env.ADMIN_SEED_ROLE_ID || '00000000-0000-4000-8000-000000000001',
  };
}
