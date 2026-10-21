import { loadConfig } from './config';

const base = { JWKS_URI: 'http://a', REDIS_URL: 'redis://r', QDRANT_URL: 'http://q', USER_SERVICE_URL: 'http://u' };

describe('loadConfig', () => {
  it('applies budget defaults and does not require a key', () => {
    const c = loadConfig(base);
    expect([c.agentDeadlineMs, c.llmTimeoutMs, c.userToolTimeoutMs]).toEqual([30000, 20000, 3000]);
    expect(c.anthropicApiKey).toBe('');
  });

  it('fails when a key is set without LLM_MODEL or a required var is missing', () => {
    expect(() => loadConfig({ ...base, ANTHROPIC_API_KEY: 'k' })).toThrow('LLM_MODEL');
    expect(() => loadConfig({ REDIS_URL: 'x' })).toThrow('JWKS_URI');
  });
});
