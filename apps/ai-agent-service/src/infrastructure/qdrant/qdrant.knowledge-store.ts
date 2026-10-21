import { createHash } from 'node:crypto';
import { EMBEDDING_DIMENSIONS } from '../../application/ports/embedding-provider.port';
import type {
  EmbeddedChunk,
  KnowledgeStore,
  SearchHit,
  SearchOptions,
} from '../../application/ports/knowledge-store.port';

export const COLLECTION = 'knowledge_base';

/** Subset of @qdrant/js-client-rest used by the adapter (allows a test double). */
export interface QdrantClientLike {
  collectionExists(name: string): Promise<{ exists: boolean }>;
  createCollection(name: string, body: Record<string, unknown>): Promise<unknown>;
  createPayloadIndex(name: string, body: Record<string, unknown>): Promise<unknown>;
  delete(name: string, body: Record<string, unknown>): Promise<unknown>;
  upsert(name: string, body: Record<string, unknown>): Promise<unknown>;
  query(
    name: string,
    body: Record<string, unknown>,
  ): Promise<{ points: Array<{ score: number; payload?: Record<string, unknown> | null }> }>;
}

/** Deterministic UUID-shaped point id from docId#chunkIdx. */
export function pointId(docId: string, chunkIdx: number): string {
  const h = createHash('sha1').update(`${docId}#${chunkIdx}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export class QdrantKnowledgeStore implements KnowledgeStore {
  constructor(private readonly client: QdrantClientLike) {}

  async ensureCollection(): Promise<void> {
    const { exists } = await this.client.collectionExists(COLLECTION);
    if (exists) return;
    await this.client.createCollection(COLLECTION, { vectors: { size: EMBEDDING_DIMENSIONS, distance: 'Cosine' } });
    for (const field of ['roleScope', 'docId']) {
      await this.client.createPayloadIndex(COLLECTION, { field_name: field, field_schema: 'keyword', wait: true });
    }
  }

  async upsertDocument(docId: string, chunks: EmbeddedChunk[]): Promise<void> {
    await this.client.delete(COLLECTION, { wait: true, filter: { must: [{ key: 'docId', match: { value: docId } }] } });
    if (chunks.length === 0) return;
    await this.client.upsert(COLLECTION, {
      wait: true,
      points: chunks.map((c) => ({
        id: pointId(c.docId, c.chunkIdx),
        vector: c.vector,
        payload: { source: c.source, docId: c.docId, chunkIdx: c.chunkIdx, roleScope: c.roleScope, text: c.text },
      })),
    });
  }

  async search(vector: number[], opts: SearchOptions): Promise<SearchHit[]> {
    if (opts.roleScopes.length === 0) throw new Error('roleScopes is required');
    const { points } = await this.client.query(COLLECTION, {
      query: vector,
      limit: opts.limit,
      with_payload: true,
      filter: { must: [{ key: 'roleScope', match: { any: opts.roleScopes } }] },
    });
    return points.map((r) => {
      const p = (r.payload ?? {}) as Record<string, unknown>;
      return {
        docId: String(p.docId),
        source: String(p.source),
        chunkIdx: Number(p.chunkIdx),
        roleScope: (p.roleScope as string[]) ?? [],
        text: String(p.text),
        score: r.score,
      };
    });
  }
}
