import { join } from 'node:path';
import { AskAgentUseCase } from '../application/ask/ask-agent.use-case';
import { IngestDocumentUseCase } from '../application/ingest/ingest-document.use-case';
import { seedKnowledge } from '../application/ingest/seed-loader';
import type { LlmProvider } from '../application/ports/llm-provider.port';
import type { UserDirectoryGateway } from '../application/ports/user-directory-gateway.port';
import { HashEmbeddingProvider } from '../infrastructure/embeddings/hash-embedding.provider';
import { MockProvider } from '../infrastructure/llm/mock.provider';
import { InMemoryKnowledgeStore } from '../infrastructure/qdrant/in-memory.knowledge-store';
import { EVAL_DATASET } from './dataset';
import { renderReport, runEval } from './runner';

export const KNOWLEDGE_DIR = join(__dirname, '..', '..', 'knowledge');

const fakeUsers: UserDirectoryGateway = {
  async lookup() {
    return [
      { id: 'u-1', name: 'Ana Perez', roleId: 'admin', status: 'active' },
      { id: 'u-2', name: 'Luis Gomez', roleId: 'viewer', status: 'active' },
    ];
  },
};

/** Keyless evaluation: mock provider (or an injected one), hash embeddings, in-memory store. */
export async function evaluate(llm: LlmProvider = new MockProvider(), priceEnv = process.env) {
  const embedder = new HashEmbeddingProvider();
  const store = new InMemoryKnowledgeStore();
  const ingest = new IngestDocumentUseCase(embedder, store, { chunkMaxTokens: 256, chunkOverlapTokens: 32, ingestMaxChars: 50000 });
  await seedKnowledge(KNOWLEDGE_DIR, ingest);
  const useCase = new AskAgentUseCase({
    embedder,
    store,
    llm,
    users: fakeUsers,
    metrics: { record: () => undefined },
    settings: { ragTopK: 4, ragMinScore: 0.12, llmMaxTokens: 512, llmTimeoutMs: 20000, agentDeadlineMs: 30000 },
    priceEnv,
  });
  const known = ['roles-permisos', 'auditoria-eventos', 'guia-uso', 'seguridad-politicas'];
  const { results, summary } = await runEval(useCase, EVAL_DATASET, known);
  return { results, summary, report: renderReport(summary, results, new Date().toISOString()) };
}
