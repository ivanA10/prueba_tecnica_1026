import { HttpStatusError } from '@toka/http-client';
import { createEnvelope } from '@toka/contracts';
import { HttpAuthClient, HttpRoleClient, ServiceTokenProvider } from './clients';
import { AmqpEventPublisher, OutboxPublisher } from './outbox.publisher';
import { EmailTakenError, RoleNotFoundError, UserNotFoundError } from './ports';
import { PrismaUserRepository } from './users.repository';

describe('clients', () => {
  it('ServiceTokenProvider caches per audience until exp', async () => {
    const request = jest.fn().mockResolvedValue({ status: 200, body: { access_token: 't', expires_in: 300 } });
    const p = new ServiceTokenProvider({ request } as never, 'id', 'secret', () => 1000);
    await p.getToken('auth-service');
    await p.getToken('auth-service');
    await p.getToken('role-service');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('role/auth clients map 404 and 409 and treat DELETE 404 as success', async () => {
    const tokens = { getToken: jest.fn().mockResolvedValue('t') };
    const http = { request: jest.fn() };
    http.request.mockRejectedValueOnce(new HttpStatusError(404, {}, 'u'));
    await expect(new HttpRoleClient(http as never, tokens).getRole('r', 1000)).rejects.toBeInstanceOf(RoleNotFoundError);

    http.request.mockResolvedValueOnce({ status: 200, body: { id: 'r', name: 'admin', version: 2, extra: 1 } });
    expect(await new HttpRoleClient(http as never, tokens).getRole('r', 1000)).toEqual({ id: 'r', name: 'admin', version: 2, permissions: [] });

    const auth = new HttpAuthClient(http as never, tokens);
    http.request.mockRejectedValueOnce(new HttpStatusError(409, {}, 'u'));
    await expect(
      auth.putCredentials('u', { email: 'e', password: 'p', roleId: 'r', roleName: 'n', roleVersion: 1, rolePermissions: [] }, 1000),
    ).rejects.toThrow();
    http.request.mockRejectedValueOnce(new HttpStatusError(404, {}, 'u'));
    await expect(auth.deleteCredentials('u')).resolves.toBeUndefined();
    http.request.mockRejectedValueOnce(new HttpStatusError(500, {}, 'u'));
    await expect(auth.deleteCredentials('u')).rejects.toThrow();
  });
});

describe('PrismaUserRepository', () => {
  const row = { id: 'u', email: 'e', name: 'n', roleId: 'r', status: 'ACTIVE', version: 2, createdAt: new Date() };

  function fakePrisma() {
    const tx = {
      user: { update: jest.fn().mockResolvedValue(row), delete: jest.fn().mockResolvedValue(row) },
      outboxEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      tx,
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      user: {
        create: jest.fn().mockResolvedValue(row),
        findUnique: jest.fn().mockResolvedValue(row),
        findMany: jest.fn().mockResolvedValue([row]),
        count: jest.fn().mockResolvedValue(1),
        deleteMany: jest.fn().mockResolvedValue({}),
      },
    };
    return prisma;
  }
  const build = (u: { id: string; version: number }) =>
    createEnvelope({ type: 'user.updated', aggregateVersion: u.version, correlationId: 'c', actor: 'system', payload: {} });

  it('writes state change and outbox row inside one transaction, bumping version', async () => {
    const prisma = fakePrisma();
    const repo = new PrismaUserRepository(prisma as never);
    await repo.persistWithOutbox('u', { status: 'ACTIVE' }, build);
    await repo.deleteWithOutbox('u', build);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(prisma.tx.user.update).toHaveBeenCalledWith({
      where: { id: 'u' },
      data: { status: 'ACTIVE', version: { increment: 1 } },
    });
    expect(prisma.tx.outboxEvent.create).toHaveBeenCalledTimes(2);
    expect(prisma.tx.outboxEvent.create.mock.calls[1][0].data.aggregateVersion).toBe(3);
  });

  it('maps Prisma errors and reads', async () => {
    const prisma = fakePrisma();
    const repo = new PrismaUserRepository(prisma as never);
    prisma.user.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(repo.createPending({ id: 'u', email: 'e', name: 'n', roleId: 'r' })).rejects.toBeInstanceOf(EmailTakenError);
    prisma.tx.user.update.mockRejectedValueOnce({ code: 'P2025' });
    await expect(repo.persistWithOutbox('u', {}, build)).rejects.toBeInstanceOf(UserNotFoundError);
    prisma.tx.user.delete.mockRejectedValueOnce({ code: 'P2025' });
    await expect(repo.deleteWithOutbox('u', build)).rejects.toBeInstanceOf(UserNotFoundError);
    expect((await repo.list(2, 10)).total).toBe(1);
    expect(await repo.findById('u')).toMatchObject({ id: 'u' });
    expect((await repo.findStalePending(new Date()))).toHaveLength(1);
    await repo.deletePending('u');
    expect(prisma.user.deleteMany).toHaveBeenCalledWith({ where: { id: 'u', status: 'PENDING' } });
  });
});

describe('OutboxPublisher', () => {
  const env = (n: number) =>
    createEnvelope({ type: 'user.created', aggregateVersion: n, correlationId: 'c', actor: 'system', payload: {} });

  function setup(rows: unknown[]) {
    const tx = { $queryRaw: jest.fn().mockResolvedValue(rows), outboxEvent: { update: jest.fn() } };
    const prisma = { $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
    const publisher = { publish: jest.fn().mockResolvedValue(undefined), isReady: jest.fn().mockResolvedValue(true) };
    const pub = new OutboxPublisher(prisma as never, publisher, { outboxBatch: 10, outboxPollMs: 1000, outboxMaxAttempts: 3 });
    return { tx, publisher, pub };
  }

  it('publishes in order and marks rows published', async () => {
    const { tx, publisher, pub } = setup([
      { seq: 1n, type: 'user.created', envelope: env(1) },
      { seq: 2n, type: 'user.updated', envelope: env(2) },
    ]);
    expect(await pub.flush()).toBe(2);
    expect(publisher.publish.mock.calls.map((c) => c[0])).toEqual(['user.created', 'user.updated']);
    expect(tx.outboxEvent.update.mock.calls[0][0].data.publishedAt).toBeInstanceOf(Date);
  });

  it('broker down stops the batch without counting attempts', async () => {
    const { tx, publisher, pub } = setup([
      { seq: 1n, aggregateId: 'a', attempts: 0, type: 'user.created', envelope: env(1) },
      { seq: 2n, aggregateId: 'b', attempts: 0, type: 'user.updated', envelope: env(2) },
    ]);
    publisher.publish.mockRejectedValueOnce(new Error('broker down'));
    publisher.isReady.mockResolvedValueOnce(false);
    expect(await pub.flush()).toBe(0);
    expect(publisher.publish).toHaveBeenCalledTimes(1);
    expect(tx.outboxEvent.update).not.toHaveBeenCalled();
  });

  it('poison row: counted, then marked dead at max attempts; other rows still publish, same aggregate is held back', async () => {
    const { tx, publisher, pub } = setup([
      { seq: 1n, eventId: 'e1', aggregateId: 'a', attempts: 1, type: 'user.created', envelope: env(1) },
      { seq: 2n, eventId: 'e2', aggregateId: 'a', attempts: 0, type: 'user.updated', envelope: env(2) },
      { seq: 3n, eventId: 'e3', aggregateId: 'b', attempts: 0, type: 'user.created', envelope: env(1) },
    ]);
    publisher.publish.mockRejectedValueOnce(new Error('poison'));
    // attempts 1 -> 2 (< 3): counted, aggregate a held back, aggregate b published
    expect(await pub.flush()).toBe(1);
    expect(tx.outboxEvent.update).toHaveBeenCalledWith({ where: { seq: 1n }, data: { attempts: { increment: 1 } } });
    expect(publisher.publish).toHaveBeenCalledTimes(2);
    // attempts 2 -> 3 (>= max): dead, and the next row of the aggregate publishes
    tx.outboxEvent.update.mockClear();
    publisher.publish.mockRejectedValueOnce(new Error('poison'));
    tx.$queryRaw.mockResolvedValue([
      { seq: 1n, eventId: 'e1', aggregateId: 'a', attempts: 2, type: 'user.created', envelope: env(1) },
      { seq: 2n, eventId: 'e2', aggregateId: 'a', attempts: 0, type: 'user.updated', envelope: env(2) },
    ]);
    expect(await pub.flush()).toBe(1);
    expect(tx.outboxEvent.update.mock.calls[0][0]).toMatchObject({
      where: { seq: 1n },
      data: { failedAt: expect.any(Date) },
    });
  });
});

describe('AmqpEventPublisher', () => {
  it('publishes persistent messages with confirm and resets on failure', async () => {
    const channel = {
      assertExchange: jest.fn().mockResolvedValue({}),
      assertQueue: jest.fn().mockResolvedValue({}),
      bindQueue: jest.fn().mockResolvedValue({}),
      publish: jest.fn((_e, _k, _c, _o, cb: (e: unknown) => void) => {
        cb(null);
        return true;
      }),
      close: jest.fn(),
      on: jest.fn(),
    };
    const conn = { createConfirmChannel: jest.fn().mockResolvedValue(channel), close: jest.fn().mockResolvedValue(undefined), on: jest.fn() };
    const connect = jest.fn().mockResolvedValue(conn);
    const p = new AmqpEventPublisher('amqp://x', connect);
    const e = createEnvelope({ type: 'user.created', aggregateVersion: 2, correlationId: 'c', actor: 'system', payload: {} });
    await p.publish('user.created', e);
    expect(channel.publish.mock.calls[0][0]).toBe('toka.events');
    expect(channel.publish.mock.calls[0][3]).toMatchObject({ persistent: true, messageId: e.eventId });
    expect(await p.isReady()).toBe(true);

    channel.publish.mockImplementationOnce((_e, _k, _c, _o, cb: (e: unknown) => void) => {
      cb(new Error('nack'));
      return true;
    });
    await expect(p.publish('user.created', e)).rejects.toThrow('nack');
    connect.mockRejectedValueOnce(new Error('refused'));
    expect(await p.isReady()).toBe(false);
    await p.close();
  });

  it('declares the consumer queues on connect and rejects a mandatory message the broker returns', async () => {
    const handlers: Record<string, (...a: unknown[]) => void> = {};
    const channel = {
      assertExchange: jest.fn().mockResolvedValue({}),
      assertQueue: jest.fn().mockResolvedValue({}),
      bindQueue: jest.fn().mockResolvedValue({}),
      publish: jest.fn((_e, _k, _c, opts: { messageId: string }, cb: (e: unknown) => void) => {
        handlers.return({ properties: { messageId: opts.messageId } }); // basic.return precedes basic.ack
        cb(null);
        return true;
      }),
      close: jest.fn(),
      on: jest.fn((ev: string, cb: (...a: unknown[]) => void) => {
        handlers[ev] = cb;
      }),
    };
    const conn = { createConfirmChannel: jest.fn().mockResolvedValue(channel), close: jest.fn().mockResolvedValue(undefined), on: jest.fn() };
    const p = new AmqpEventPublisher('amqp://x', jest.fn().mockResolvedValue(conn));
    expect(await p.isReady()).toBe(true);
    expect(channel.assertQueue.mock.calls.map((c) => c[0])).toEqual(['audit.events', 'auth.user-projection']);

    const e = createEnvelope({ type: 'user.created', aggregateVersion: 1, correlationId: 'c', actor: 'system', payload: {} });
    await expect(p.publish('user.created', e)).rejects.toThrow('unroutable');
    expect(channel.publish.mock.calls[0][3]).toMatchObject({ mandatory: true });
    expect(channel.assertQueue).toHaveBeenCalledTimes(4); // re-declared after the return
    expect(conn.createConfirmChannel).toHaveBeenCalledTimes(1); // channel kept, not reset
  });
});
