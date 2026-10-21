import { LlmUnavailableError } from '../../application/ports/llm-provider.port';
import type { LlmProvider, LlmRequest } from '../../application/ports/llm-provider.port';
import { AnthropicProvider, AnthropicClientLike, toApiMessages } from './anthropic.provider';
import { estimateCost } from './cost';
import { MockProvider } from './mock.provider';
import { createLlmProvider } from './provider.factory';
import { ResilientLlmProvider } from './resilient.provider';
import { loadConfig } from '../../config/config';

const req = (over: Partial<LlmRequest> = {}): LlmRequest => ({
  system: 'sys',
  messages: [
    { role: 'user', content: '<context>\n<fragment docId="d1" source="s">Primera frase. Segunda frase. Tercera.</fragment>\n</context>\n<user_question>hola</user_question>' },
  ],
  maxTokens: 100,
  timeoutMs: 1000,
  ...over,
});

describe('MockProvider', () => {
  it('is deterministic, grounded in fragments and requests lookup_users for user questions', async () => {
    const m = new MockProvider();
    const a = await m.generate(req());
    expect(await m.generate(req())).toEqual(a);
    const parsed = JSON.parse(a.text);
    expect(parsed.sources).toEqual([{ docId: 'd1' }]);
    expect(a.usage.tokensIn).toBeGreaterThan(0);

    const tool = { name: 'lookup_users', description: '', inputSchema: {} };
    const userQ = req({
      tools: [tool],
      messages: [{ role: 'user', content: '<user_question>lista de usuarios</user_question>' }],
    });
    expect((await m.generate(userQ)).toolCalls[0].name).toBe('lookup_users');
    const refusal = JSON.parse((await m.generate(req({ messages: [{ role: 'user', content: '<context></context>' }] }))).text);
    expect(refusal.refused).toBe(true);
  });
});

describe('createLlmProvider + ResilientLlmProvider', () => {
  const cfg = loadConfig({ JWKS_URI: 'x', REDIS_URL: 'x', QDRANT_URL: 'x', USER_SERVICE_URL: 'x' });

  it('selects mock without API key', () => {
    expect(createLlmProvider(cfg).name).toBe('mock');
  });

  it('opens the breaker after consecutive failures but ignores 4xx', async () => {
    let calls = 0;
    const failing: LlmProvider = {
      name: 'x',
      generate: async () => {
        calls++;
        throw new LlmUnavailableError('boom', 500);
      },
    };
    const r = new ResilientLlmProvider(failing, { maxConcurrency: 1, breakerThreshold: 2, breakerResetMs: 1000 });
    await expect(r.generate(req())).rejects.toThrow('boom');
    await expect(r.generate(req())).rejects.toThrow('boom');
    await expect(r.generate(req())).rejects.toThrow('circuit open');
    expect(calls).toBe(2);

    const bad: LlmProvider = { name: 'y', generate: async () => { throw new LlmUnavailableError('bad', 400); } };
    const r2 = new ResilientLlmProvider(bad, { maxConcurrency: 1, breakerThreshold: 1, breakerResetMs: 1000 });
    await expect(r2.generate(req())).rejects.toThrow('bad');
    await expect(r2.generate(req())).rejects.toThrow('bad');
  });
});

describe('AnthropicProvider', () => {
  it('maps request (cache_control, tools, tool_result) and usage; wraps SDK errors', async () => {
    const create = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'hi' }, { type: 'tool_use', id: 't1', name: 'lookup_users', input: { query: 'a' } }],
      usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 3 },
    });
    const p = new AnthropicProvider({ model: 'test-model', client: { messages: { create } } as AnthropicClientLike });
    const res = await p.generate(
      req({ tools: [{ name: 'lookup_users', description: 'd', inputSchema: { type: 'object' } }] }),
    );
    const [body, opts] = create.mock.calls[0];
    expect(body.model).toBe('test-model');
    expect(body.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(body.tools[0].input_schema).toEqual({ type: 'object' });
    expect(opts.timeout).toBe(1000);
    expect(res.usage).toEqual({ tokensIn: 13, tokensOut: 5 });
    expect(res.toolCalls[0]).toEqual({ id: 't1', name: 'lookup_users', input: { query: 'a' } });

    const msgs = toApiMessages([
      { role: 'user', content: 'q' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'a', name: 'n', input: {} }, { id: 'b', name: 'n', input: {} }] },
      { role: 'tool', toolCallId: 'a', content: 'r1' },
      { role: 'tool', toolCallId: 'b', content: 'r2' },
    ]);
    expect(msgs).toHaveLength(3);
    expect((msgs[2].content as unknown[]).length).toBe(2);

    create.mockRejectedValueOnce(Object.assign(new Error('rate'), { status: 429 }));
    await expect(p.generate(req())).rejects.toMatchObject({ name: 'LlmUnavailableError', status: 429 });
  });
});

describe('estimateCost', () => {
  it('returns null without prices and computes from env prices', () => {
    expect(estimateCost({ tokensIn: 1000, tokensOut: 1000 }, {})).toBeNull();
    const c = estimateCost(
      { tokensIn: 1_000_000, tokensOut: 500_000 },
      { LLM_PRICE_INPUT_PER_MTOK: '2', LLM_PRICE_OUTPUT_PER_MTOK: '4' },
    );
    expect(c).toBeCloseTo(4);
  });
});
