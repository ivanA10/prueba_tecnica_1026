import type {
  EmbeddedChunk,
  KnowledgeStore,
  SearchHit,
  SearchOptions,
} from '../../application/ports/knowledge-store.port';

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

export class InMemoryKnowledgeStore implements KnowledgeStore {
  private readonly docs = new Map<string, EmbeddedChunk[]>();

  async ensureCollection(): Promise<void> {
    // nothing to create
  }

  async upsertDocument(docId: string, chunks: EmbeddedChunk[]): Promise<void> {
    this.docs.set(docId, chunks);
  }

  async search(vector: number[], opts: SearchOptions): Promise<SearchHit[]> {
    if (opts.roleScopes.length === 0) throw new Error('roleScopes is required');
    const hits: SearchHit[] = [];
    for (const chunks of this.docs.values()) {
      for (const { vector: v, ...chunk } of chunks) {
        if (!chunk.roleScope.some((r) => opts.roleScopes.includes(r))) continue;
        hits.push({ ...chunk, score: cosine(vector, v) });
      }
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, opts.limit);
  }
}
