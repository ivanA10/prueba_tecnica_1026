import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HashEmbeddingProvider } from '../../infrastructure/embeddings/hash-embedding.provider';
import { InMemoryKnowledgeStore } from '../../infrastructure/qdrant/in-memory.knowledge-store';
import { IngestDocumentUseCase } from './ingest-document.use-case';
import { parseKnowledgeFile, seedKnowledge } from './seed-loader';

const settings = { chunkMaxTokens: 50, chunkOverlapTokens: 5, ingestMaxChars: 1000 };

describe('ingest', () => {
  it('is idempotent per docId and enforces the size limit', async () => {
    const store = new InMemoryKnowledgeStore();
    const uc = new IngestDocumentUseCase(new HashEmbeddingProvider(), store, settings);
    const doc = { docId: 'd', source: 's', roleScope: ['all'], text: 'Los administradores gestionan usuarios y roles.' };
    await uc.ingest(doc);
    await uc.ingest(doc);
    const e = new HashEmbeddingProvider();
    const [v] = await e.embed(['administradores usuarios']);
    expect(await store.search(v, { roleScopes: ['all'], limit: 10 })).toHaveLength(1);
    await expect(uc.ingest({ ...doc, text: 'x'.repeat(2000) })).rejects.toThrow('INGEST_MAX_CHARS');
  });

  it('parses front-matter and seeds a directory twice without duplicating', async () => {
    expect(parseKnowledgeFile('---\ndocId: x\nsource: Y\nroleScope: [admin, ops]\n---\nbody', 'f')).toEqual({
      docId: 'x',
      source: 'Y',
      roleScope: ['admin', 'ops'],
      text: 'body',
    });
    expect(parseKnowledgeFile('sin front matter', 'fallback').roleScope).toEqual(['all']);
    const dir = mkdtempSync(join(tmpdir(), 'kb-'));
    writeFileSync(join(dir, 'a.md'), '---\ndocId: a\nsource: A\nroleScope: [all]\n---\nTexto sobre roles.');
    const store = new InMemoryKnowledgeStore();
    const uc = new IngestDocumentUseCase(new HashEmbeddingProvider(), store, settings);
    expect(await seedKnowledge(dir, uc)).toBe(1);
    await seedKnowledge(dir, uc);
    const [v] = await new HashEmbeddingProvider().embed(['roles']);
    expect(await store.search(v, { roleScopes: ['all'], limit: 10 })).toHaveLength(1);
  });
});
