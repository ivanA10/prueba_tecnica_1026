import { createEnvelope } from '@toka/contracts';
import { AuditProcessor, AuditRepository } from './audit.processor';

const buf = (o: unknown) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o));
const env = (extra: object = {}) => ({
  ...createEnvelope({
    type: 'user.created',
    aggregateVersion: 2,
    correlationId: 'cid',
    actor: { userId: 'admin-1', roles: ['admin'] },
    payload: { userId: 'u1' },
  }),
  ...extra,
});

function setup() {
  const repo: jest.Mocked<AuditRepository> = {
    insert: jest.fn().mockResolvedValue('inserted'),
    query: jest.fn().mockResolvedValue({ items: [], total: 0 }),
  };
  return { repo, proc: new AuditProcessor(repo, { maxRetries: 3 }) };
}

describe('AuditProcessor', () => {
  it('maps actor and inserts; a duplicate eventId is still ack', async () => {
    const { repo, proc } = setup();
    expect(await proc.process(buf(env()), 0)).toEqual({ action: 'ack' });
    expect(repo.insert.mock.calls[0][0]).toMatchObject({
      type: 'user.created',
      actorUserId: 'admin-1',
      actorRoles: ['admin'],
      actorIsSystem: false,
      routingKey: 'user.created',
    });
    repo.insert.mockResolvedValue('duplicate');
    expect(await proc.process(buf(env()), 0)).toEqual({ action: 'ack' });
  });

  it('system actor is mapped without userId', async () => {
    const { repo, proc } = setup();
    await proc.process(buf(env({ actor: 'system' })), 0);
    expect(repo.insert.mock.calls[0][0]).toMatchObject({ actorIsSystem: true, actorRoles: [] });
    expect(repo.insert.mock.calls[0][0].actorUserId).toBeUndefined();
  });

  it('reason=resync is acked without insert', async () => {
    const { repo, proc } = setup();
    expect(await proc.process(buf(env({ reason: 'resync', actor: 'system' })), 0)).toEqual({ action: 'ack' });
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('invalid JSON or envelope goes straight to DLQ', async () => {
    const { repo, proc } = setup();
    expect(await proc.process(buf('{not json'), 0)).toMatchObject({ action: 'dlq' });
    expect(await proc.process(buf({ foo: 1 }), 0)).toMatchObject({ action: 'dlq' });
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('transient failure retries for counts 0-2 and goes to DLQ at 3', async () => {
    const { repo, proc } = setup();
    repo.insert.mockRejectedValue(new Error('mongo down'));
    for (const n of [0, 1, 2]) expect(await proc.process(buf(env()), n)).toEqual({ action: 'retry' });
    expect(await proc.process(buf(env()), 3)).toMatchObject({ action: 'dlq' });
  });
});
