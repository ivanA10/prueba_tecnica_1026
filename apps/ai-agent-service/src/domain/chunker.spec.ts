import { chunkText } from './chunker';
import { HashEmbeddingProvider } from '../infrastructure/embeddings/hash-embedding.provider';
import { createEmbeddingProvider } from '../infrastructure/embeddings/embedding.factory';

const count = (t: string) => t.split(/\s+/).filter(Boolean).length;

describe('chunkText', () => {
  it('respects the max size, overlaps and never emits empty chunks', () => {
    const text = Array.from({ length: 40 }, (_, i) => `Frase numero ${i} con varias palabras de relleno.`).join(' ');
    const chunks = chunkText(text, { maxTokens: 30, overlapTokens: 8, countTokens: count });
    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks) {
      expect(c.trim()).not.toBe('');
      expect(count(c)).toBeLessThanOrEqual(30);
    }
    const lastSentenceOfFirst = chunks[0].split('. ').pop()!.replace('.', '');
    expect(chunks[1]).toContain(lastSentenceOfFirst);
    expect(chunkText('   ', { maxTokens: 10, overlapTokens: 2, countTokens: count })).toEqual([]);
  });

  it('splits oversized sentences by words', () => {
    const long = Array.from({ length: 50 }, (_, i) => `w${i}`).join(' ');
    const chunks = chunkText(long, { maxTokens: 20, overlapTokens: 0, countTokens: count });
    expect(chunks.every((c) => count(c) <= 20)).toBe(true);
  });
});

describe('embeddings', () => {
  it('hash embeddings are deterministic 384-d unit vectors and the factory rejects hash outside tests', async () => {
    const e = new HashEmbeddingProvider();
    const [a] = await e.embed(['roles y permisos']);
    const [b] = await e.embed(['roles y permisos']);
    expect(a).toEqual(b);
    expect(a).toHaveLength(384);
    expect(Math.hypot(...a)).toBeCloseTo(1);
    expect(() => createEmbeddingProvider('hash', 'm', 'production')).toThrow();
    expect(createEmbeddingProvider('hash', 'm', 'test')).toBeInstanceOf(HashEmbeddingProvider);
  });
});
