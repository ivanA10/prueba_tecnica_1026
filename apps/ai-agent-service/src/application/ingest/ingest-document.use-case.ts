import { chunkText } from '../../domain/chunker';
import type { EmbeddingProvider } from '../ports/embedding-provider.port';
import type { KnowledgeStore } from '../ports/knowledge-store.port';

export interface IngestInput {
  docId: string;
  source: string;
  roleScope: string[];
  text: string;
}

export interface IngestSettings {
  chunkMaxTokens: number;
  chunkOverlapTokens: number;
  ingestMaxChars: number;
}

export class IngestDocumentUseCase {
  constructor(
    private readonly embedder: EmbeddingProvider,
    private readonly store: KnowledgeStore,
    private readonly settings: IngestSettings,
  ) {}

  /** Normalises, chunks, embeds and replaces the document by docId. Returns the chunk count. */
  async ingest(doc: IngestInput): Promise<number> {
    if (doc.text.length > this.settings.ingestMaxChars) throw new Error('Document exceeds INGEST_MAX_CHARS');
    await this.embedder.init();
    const pieces = chunkText(doc.text, {
      maxTokens: this.settings.chunkMaxTokens,
      overlapTokens: this.settings.chunkOverlapTokens,
      countTokens: (t) => this.embedder.countTokens(t),
    });
    const vectors = pieces.length ? await this.embedder.embed(pieces) : [];
    await this.store.upsertDocument(
      doc.docId,
      pieces.map((text, chunkIdx) => ({
        docId: doc.docId,
        source: doc.source,
        chunkIdx,
        roleScope: doc.roleScope,
        text,
        vector: vectors[chunkIdx],
      })),
    );
    return pieces.length;
  }
}
