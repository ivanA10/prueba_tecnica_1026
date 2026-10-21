import { createHash } from 'node:crypto';
import { EMBEDDING_DIMENSIONS, EmbeddingProvider } from '../../application/ports/embedding-provider.port';

const STOPWORDS = new Set(
  'a al ante con contra de del desde el en entre es la las lo los o para por que se si sin sobre su sus un una uno y the of to and in is are for on with an as at by it or be'.split(
    ' ',
  ),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/** Deterministic 384-d bag-of-words hashing embedding. For tests and keyless evaluation only. */
export class HashEmbeddingProvider implements EmbeddingProvider {
  async init(): Promise<void> {
    // nothing to load
  }

  countTokens(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.embedOne(t));
  }

  private embedOne(text: string): number[] {
    const v = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
    for (const w of tokenize(text)) {
      const h = createHash('sha1').update(w).digest();
      v[h.readUInt16BE(0) % EMBEDDING_DIMENSIONS] += h[2] % 2 === 0 ? 1 : -1;
    }
    const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0));
    return norm === 0 ? v : v.map((x) => x / norm);
  }
}
