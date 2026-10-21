import { AMQP_CONNECT, AuditConsumer, AmqpChannelLike, AmqpMessage } from './audit.consumer';
import { MongoAuditRepository } from './audit.repository';
import { AuditDocument } from './audit.processor';

describe('MongoAuditRepository', () => {
  const doc = { eventId: 'e1' } as AuditDocument;

  it('maps duplicate key (11000) to duplicate and rethrows other errors', async () => {
    const model = { create: jest.fn().mockResolvedValueOnce({}).mockRejectedValueOnce({ code: 11000 }).mockRejectedValueOnce(new Error('x')) };
    const repo = new MongoAuditRepository(model as never);
    expect(await repo.insert(doc)).toBe('inserted');
    expect(await repo.insert(doc)).toBe('duplicate');
    await expect(repo.insert(doc)).rejects.toThrow('x');
  });

  it('builds filters, sort and pagination', async () => {
    const chain = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([doc]),
    };
    const model = { find: jest.fn().mockReturnValue(chain), countDocuments: jest.fn().mockReturnValue({ exec: () => Promise.resolve(7) }) };
    const repo = new MongoAuditRepository(model as never);
    const from = new Date('2026-01-01');
    const to = new Date('2026-02-01');
    const res = await repo.query({ type: 'user.created', actor: 'a1', from, to, page: 3, limit: 10 });
    expect(res).toEqual({ items: [doc], total: 7 });
    expect(model.find).toHaveBeenCalledWith({
      type: { $regex: '^user\\.created', $options: 'i' },
      actorUserId: { $regex: '^a1', $options: 'i' },
      occurredAt: { $gte: from, $lte: to },
    });
    expect(chain.sort).toHaveBeenCalledWith({ occurredAt: -1 });
    expect(chain.skip).toHaveBeenCalledWith(20);
    expect(chain.limit).toHaveBeenCalledWith(10);
  });

  it('escapes regex metacharacters, trims, and ignores blank filters', async () => {
    const chain = { sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([]) };
    const model = { find: jest.fn().mockReturnValue(chain), countDocuments: jest.fn().mockReturnValue({ exec: () => Promise.resolve(0) }) };
    const repo = new MongoAuditRepository(model as never);
    await repo.query({ type: ' .* ', actor: '   ', page: 1, limit: 10 });
    expect(model.find).toHaveBeenCalledWith({ type: { $regex: '^\\.\\*', $options: 'i' } });
    await repo.query({ actor: 'Sys', page: 1, limit: 10 });
    expect(model.find).toHaveBeenLastCalledWith({
      $or: [{ actorIsSystem: true }, { actorUserId: { $regex: '^Sys', $options: 'i' } }],
    });
  });
});

describe('AuditConsumer', () => {
  const msg = (headers: Record<string, unknown> = {}): AmqpMessage => ({
    content: Buffer.from('{}'),
    fields: { routingKey: 'audit.events' },
    properties: { headers, messageId: 'm1' },
  });
  const channel = (): jest.Mocked<AmqpChannelLike> => ({
    assertExchange: jest.fn().mockResolvedValue({}),
    assertQueue: jest.fn().mockResolvedValue({}),
    bindQueue: jest.fn().mockResolvedValue({}),
    prefetch: jest.fn(),
    consume: jest.fn().mockResolvedValue({}),
    publish: jest.fn().mockReturnValue(true),
    ack: jest.fn(),
    close: jest.fn(),
  });
  const config = { rabbitmqUrl: 'amqp://x', retryTtlMs: 5000, maxRetries: 3, prefetch: 10 } as never;

  it('transient failure republishes to .retry with x-retry-count+1 and acks; dlq carries the cause', async () => {
    const processor = { process: jest.fn().mockResolvedValueOnce({ action: 'retry' }).mockResolvedValueOnce({ action: 'dlq', error: 'boom' }) };
    const c = new AuditConsumer(processor as never, config, jest.fn());
    const ch = channel();
    const m = msg({ 'x-retry-count': 0 });
    await c.handle(ch, m);
    expect(ch.publish).toHaveBeenCalledWith('toka.events.dlx', 'audit.events.retry', m.content, expect.objectContaining({ headers: { 'x-retry-count': 1 } }));
    expect(ch.ack).toHaveBeenCalledWith(m);
    await c.handle(ch, msg({ 'x-retry-count': 3 }));
    expect(ch.publish.mock.calls[1][1]).toBe('audit.events.dlq');
    expect(ch.publish.mock.calls[1][3]).toMatchObject({ headers: { 'x-error': 'boom', 'x-failed-at': expect.any(String) } });
  });

  it('declares retry/DLQ topology, binds user/auth/role and reports connected', async () => {
    const ch = channel();
    const conn = { createChannel: jest.fn().mockResolvedValue(ch), close: jest.fn().mockResolvedValue(undefined), on: jest.fn() };
    const c = new AuditConsumer({} as never, config, jest.fn().mockResolvedValue(conn));
    await c.start();
    expect(c.isConnected()).toBe(true);
    const bound = ch.bindQueue.mock.calls.filter((a) => a[0] === 'audit.events' && a[1] === 'toka.events').map((a) => a[2]);
    expect(bound).toEqual(['user.#', 'auth.#', 'role.#']);
    expect(ch.assertQueue).toHaveBeenCalledWith('audit.events.retry', expect.objectContaining({ arguments: expect.objectContaining({ 'x-message-ttl': 5000 }) }));
    await c.onModuleDestroy();
    expect(AMQP_CONNECT).toBeDefined();
  });
});
