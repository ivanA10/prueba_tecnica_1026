import { HashEmbeddingProvider } from '../../infrastructure/embeddings/hash-embedding.provider';
import { MockProvider } from '../../infrastructure/llm/mock.provider';
import { InMemoryKnowledgeStore } from '../../infrastructure/qdrant/in-memory.knowledge-store';
import { LlmProvider, LlmRequest, LlmUnavailableError } from '../ports/llm-provider.port';
import { UserToolUnavailableError } from '../ports/user-directory-gateway.port';
import { AskAgentUseCase } from './ask-agent.use-case';
import { validateAgentOutput } from './validate-output';

async function setup(llm: LlmProvider, users = { lookup: jest.fn().mockResolvedValue([{ id: '1', name: 'Ana', roleId: 'r', status: 'active' }]) }) {
  const embedder = new HashEmbeddingProvider();
  const store = new InMemoryKnowledgeStore();
  const add = async (docId: string, roleScope: string[], text: string) =>
    store.upsertDocument(docId, [{ docId, source: `src-${docId}`, chunkIdx: 0, roleScope, text, vector: (await embedder.embed([text]))[0] }]);
  await add('roles', ['all'], 'El rol admin puede crear usuarios y asignar roles.');
  await add('audit', ['admin'], 'La auditoria registra eventos de acceso denegado.');
  const metrics = { record: jest.fn() };
  const uc = new AskAgentUseCase({
    embedder, store, llm, users, metrics,
    settings: { ragTopK: 3, ragMinScore: 0.1, llmMaxTokens: 100, llmTimeoutMs: 1000, agentDeadlineMs: 200 },
    priceEnv: { LLM_PRICE_INPUT_PER_MTOK: '1', LLM_PRICE_OUTPUT_PER_MTOK: '2' },
  });
  return { uc, metrics, users };
}
const input = (question: string, roles: string[], permissions: string[] = []) => ({ question, roles, permissions, authorization: 'Bearer t' });

describe('AskAgentUseCase', () => {
  it('happy path: grounded answer with sources, tokens, cost and metrics', async () => {
    const { uc, metrics } = await setup(new MockProvider());
    const r = await uc.ask(input('Que puede hacer el rol admin con los usuarios?', ['viewer']));
    expect(r.degraded).toBe(false);
    expect(r.sources[0]).toMatchObject({ docId: 'roles', source: 'src-roles' });
    expect(r.meta).toMatchObject({ provider: 'mock' });
    expect(r.meta.tokensIn).toBeGreaterThan(0);
    expect(r.meta.costUsd).not.toBeNull();
    expect(metrics.record).toHaveBeenCalledWith(expect.objectContaining({ degraded: false }));
  });

  it('role scope comes from the JWT: non-admin never gets admin-only fragments', async () => {
    const seen: LlmRequest[] = [];
    const spy: LlmProvider = { name: 'spy', generate: async (q) => { seen.push(q); return new MockProvider().generate(q); } };
    const { uc } = await setup(spy);
    await uc.ask(input('auditoria eventos acceso denegado', ['viewer']));
    expect(seen[0].messages[0].content).not.toContain('docId="audit"');
    expect(seen[0].messages[0].content).toContain('<user_question>');
    await uc.ask(input('auditoria eventos acceso denegado', ['admin']));
    expect(seen[1].messages[0].content).toContain('docId="audit"');
  });

  it('degrades to fragments when the LLM fails', async () => {
    const failing: LlmProvider = { name: 'x', generate: async () => { throw new LlmUnavailableError('down'); } };
    const { uc } = await setup(failing);
    const r = await uc.ask(input('rol admin crear usuarios', ['viewer']));
    expect(r.degraded).toBe(true);
    expect(r.answer).toContain('admin');
    expect(r.sources.length).toBeGreaterThan(0);
  });

  it('aborts and degrades when the deadline is exhausted', async () => {
    const slow: LlmProvider = {
      name: 'slow',
      generate: (q) => new Promise((_, rej) => q.signal?.addEventListener('abort', () => rej(new Error('aborted')))),
    };
    const { uc } = await setup(slow);
    const r = await uc.ask(input('rol admin crear usuarios', ['viewer']));
    expect(r.degraded).toBe(true);
    expect(r.meta.latencyMs).toBeGreaterThanOrEqual(150);
  });

  it('drops unknown docIds, uses text fallback, degrades on empty output', async () => {
    expect(validateAgentOutput('{"answer":"a","sources":[{"docId":"roles"},{"docId":"ghost"}]}', ['roles'])?.answer.sources).toEqual([{ docId: 'roles' }]);
    expect(validateAgentOutput('texto libre', ['roles'])).toMatchObject({ fallback: true });
    expect(validateAgentOutput('', ['roles'])).toBeNull();
    expect(validateAgentOutput('{"answer":', ['roles'])).toBeNull();
  });

  it('offers lookup_users only with users:read and continues without it when the tool fails (403)', async () => {
    const { uc, users } = await setup(new MockProvider());
    const none = await uc.ask(input('Cuantos usuarios hay?', ['auditor'], ['audit:read']));
    expect(none.meta.toolCalls).toBe(0);
    expect(users.lookup).not.toHaveBeenCalled();

    const ok = await uc.ask(input('Cuantos usuarios hay?', ['operador'], ['users:read']));
    expect(ok.meta.toolCalls).toBe(1);
    expect(users.lookup).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ authorization: 'Bearer t' }));

    users.lookup.mockRejectedValueOnce(new UserToolUnavailableError('forbidden', 403));
    const denied = await uc.ask(input('Cuantos usuarios hay?', ['admin'], ['*']));
    expect(denied.degraded).toBe(false);
    expect(denied.meta.toolCalls).toBe(0);
  });
});
