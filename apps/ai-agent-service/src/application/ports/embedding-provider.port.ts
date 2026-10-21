export const EMBEDDING_DIMENSIONS = 384;

export interface EmbeddingProvider {
  /** Loads heavy resources (model); idempotent. */
  init(): Promise<void>;
  embed(texts: string[]): Promise<number[][]>;
  countTokens(text: string): number;
}
