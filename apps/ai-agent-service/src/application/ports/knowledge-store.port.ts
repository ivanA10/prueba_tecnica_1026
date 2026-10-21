export interface KnowledgeChunk {
  docId: string;
  source: string;
  chunkIdx: number;
  roleScope: string[];
  text: string;
}

export interface EmbeddedChunk extends KnowledgeChunk {
  vector: number[];
}

export interface SearchHit extends KnowledgeChunk {
  score: number;
}

export interface SearchOptions {
  /** Mandatory and non-empty: the port cannot search without a role filter. */
  roleScopes: string[];
  limit: number;
}

export interface KnowledgeStore {
  ensureCollection(): Promise<void>;
  /** Replaces every chunk of `docId` (idempotent). */
  upsertDocument(docId: string, chunks: EmbeddedChunk[]): Promise<void>;
  search(vector: number[], opts: SearchOptions): Promise<SearchHit[]>;
}
