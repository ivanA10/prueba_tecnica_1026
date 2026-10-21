import { InMemoryKnowledgeStore } from './in-memory.knowledge-store';
import { COLLECTION, QdrantClientLike, QdrantKnowledgeStore, pointId } from './qdrant.knowledge-store';

const chunk = (docId: string, roleScope: string[], vector: number[]) => ({
  docId,
  source: 's',
  chunkIdx: 0,
  roleScope,
  text: `text ${docId}`,
  vector,
});

describe('InMemoryKnowledgeStore', () => {
  it('replaces a document by docId and enforces roleScope', async () => {
    const s = new InMemoryKnowledgeStore();
    await s.upsertDocument('a', [chunk('a', ['admin'], [1, 0])]);
    await s.upsertDocument('b', [chunk('b', ['all'], [0, 1])]);
    await s.upsertDocument('a', [chunk('a', ['admin'], [1, 0]), { ...chunk('a', ['admin'], [1, 0]), chunkIdx: 1 }]);
    expect((await s.search([1, 0], { roleScopes: ['all'], limit: 5 })).map((h) => h.docId)).toEqual(['b']);
    expect(await s.search([1, 0], { roleScopes: ['admin', 'all'], limit: 5 })).toHaveLength(3);
    await expect(s.search([1, 0], { roleScopes: [], limit: 1 })).rejects.toThrow();
  });
});

describe('QdrantKnowledgeStore', () => {
  it('creates the collection, upserts with deterministic ids and always filters by roleScope', async () => {
    const client = {
      collectionExists: jest.fn().mockResolvedValue({ exists: false }),
      createCollection: jest.fn().mockResolvedValue({}),
      createPayloadIndex: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({}),
      search: jest.fn().mockResolvedValue([
        { score: 0.9, payload: { docId: 'a', source: 's', chunkIdx: 0, roleScope: ['all'], text: 't' } },
      ]),
    };
    const s = new QdrantKnowledgeStore(client as unknown as QdrantClientLike);
    await s.ensureCollection();
    expect(client.createCollection).toHaveBeenCalledWith(COLLECTION, { vectors: { size: 384, distance: 'Cosine' } });
    expect(client.createPayloadIndex).toHaveBeenCalledTimes(2);

    await s.upsertDocument('a', [chunk('a', ['all'], [1])]);
    expect(client.delete).toHaveBeenCalled();
    expect(client.upsert.mock.calls[0][1].points[0].id).toBe(pointId('a', 0));
    expect(pointId('a', 0)).toBe(pointId('a', 0));

    const hits = await s.search([1], { roleScopes: ['admin', 'all'], limit: 3 });
    expect(client.search.mock.calls[0][1].filter.must[0]).toEqual({ key: 'roleScope', match: { any: ['admin', 'all'] } });
    expect(hits[0]).toMatchObject({ docId: 'a', score: 0.9 });
    await expect(s.search([1], { roleScopes: [], limit: 1 })).rejects.toThrow();
  });
});
