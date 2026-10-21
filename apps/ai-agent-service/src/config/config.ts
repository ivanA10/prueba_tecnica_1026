export interface AgentConfig {
  port: number;
  jwtIssuer: string;
  jwtAudience: string;
  jwksUri: string;
  redisUrl: string;
  qdrantUrl: string;
  userServiceUrl: string;
  anthropicApiKey: string;
  llmModel: string;
  llmMaxTokens: number;
  llmTimeoutMs: number;
  llmMaxConcurrency: number;
  llmBreakerThreshold: number;
  llmBreakerResetMs: number;
  llmPriceInput: string | undefined;
  llmPriceOutput: string | undefined;
  agentDeadlineMs: number;
  userToolTimeoutMs: number;
  rlMax: number;
  rlWindowS: number;
  adminRole: string;
  seedOnStart: boolean;
  chunkMaxTokens: number;
  chunkOverlapTokens: number;
  ragTopK: number;
  ragMinScore: number;
  ingestMaxChars: number;
  embeddingModelDir: string;
  knowledgeDir: string;
}

type Env = Record<string, string | undefined>;

function num(env: Env, key: string, def: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Invalid numeric env var ${key}`);
  return n;
}

function required(env: Env, key: string): string {
  const v = env[key];
  if (!v || !v.trim()) throw new Error(`Missing required env var ${key}`);
  return v.trim();
}

/** Loads and validates configuration; fails fast on missing required variables. */
export function loadConfig(env: Env = process.env): AgentConfig {
  const anthropicApiKey = (env.ANTHROPIC_API_KEY ?? '').trim();
  const llmModel = (env.LLM_MODEL ?? '').trim();
  if (anthropicApiKey && !llmModel) {
    throw new Error('LLM_MODEL is required when ANTHROPIC_API_KEY is set');
  }
  return {
    port: num(env, 'PORT', 3005),
    jwtIssuer: env.JWT_ISSUER?.trim() || 'toka-auth',
    jwtAudience: env.JWT_AUDIENCE?.trim() || 'toka-api',
    jwksUri: required(env, 'JWKS_URI'),
    redisUrl: required(env, 'REDIS_URL'),
    qdrantUrl: required(env, 'QDRANT_URL'),
    userServiceUrl: required(env, 'USER_SERVICE_URL'),
    anthropicApiKey,
    llmModel,
    llmMaxTokens: num(env, 'LLM_MAX_TOKENS', 1024),
    llmTimeoutMs: num(env, 'LLM_TIMEOUT_MS', 20000),
    llmMaxConcurrency: num(env, 'LLM_MAX_CONCURRENCY', 4),
    llmBreakerThreshold: num(env, 'LLM_BREAKER_THRESHOLD', 5),
    llmBreakerResetMs: num(env, 'LLM_BREAKER_RESET_MS', 30000),
    llmPriceInput: env.LLM_PRICE_INPUT_PER_MTOK,
    llmPriceOutput: env.LLM_PRICE_OUTPUT_PER_MTOK,
    agentDeadlineMs: num(env, 'AGENT_DEADLINE_MS', 30000),
    userToolTimeoutMs: num(env, 'USER_TOOL_TIMEOUT_MS', 3000),
    rlMax: num(env, 'AGENT_RL_MAX', 20),
    rlWindowS: num(env, 'AGENT_RL_WINDOW_S', 60),
    adminRole: env.AGENT_ADMIN_ROLE?.trim() || 'admin',
    seedOnStart: (env.AGENT_SEED_ON_START ?? 'true').toLowerCase() !== 'false',
    chunkMaxTokens: num(env, 'CHUNK_MAX_TOKENS', 256),
    chunkOverlapTokens: num(env, 'CHUNK_OVERLAP_TOKENS', 32),
    ragTopK: num(env, 'RAG_TOP_K', 4),
    ragMinScore: num(env, 'RAG_MIN_SCORE', 0.25),
    ingestMaxChars: num(env, 'INGEST_MAX_CHARS', 50000),
    embeddingModelDir: env.EMBEDDING_MODEL_DIR?.trim() || 'models',
    knowledgeDir: env.KNOWLEDGE_DIR?.trim() || 'knowledge',
  };
}
