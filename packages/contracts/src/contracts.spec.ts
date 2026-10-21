import {
  DLX_EXCHANGE,
  EVENTS_EXCHANGE,
  MainQueues,
  QueueBindings,
  RoutingKeys,
  UnroutableMessageError,
  createEnvelope,
  declareEventTopology,
  deterministicEventId,
  isEventEnvelope,
} from './index';

describe('declareEventTopology', () => {
  it('declares both exchanges and every main queue with its bindings before any publish', async () => {
    const ch = {
      assertExchange: jest.fn().mockResolvedValue({}),
      assertQueue: jest.fn().mockResolvedValue({}),
      bindQueue: jest.fn().mockResolvedValue({}),
    };
    await declareEventTopology(ch);
    expect(ch.assertExchange).toHaveBeenCalledWith('toka.events', 'topic', { durable: true });
    expect(ch.assertExchange).toHaveBeenCalledWith('toka.events.dlx', 'direct', { durable: true });
    expect(ch.assertQueue.mock.calls.map((c) => c[0])).toEqual(MainQueues.map((q) => q.name));
    expect(ch.assertQueue).toHaveBeenCalledWith('audit.events', expect.objectContaining({ arguments: expect.objectContaining({ 'x-dead-letter-routing-key': 'audit.events.dlq' }) }));
    const bound = ch.bindQueue.mock.calls.map((c) => `${c[0]}:${c[2]}`);
    expect(bound).toContain('auth.user-projection:user.#');
    expect(bound).toContain('auth.user-projection:role.created');
    expect(bound).toContain('audit.events:auth.#');
    expect(new UnroutableMessageError('user.created').message).toContain('user.created');
  });
});

describe('contracts', () => {
  it('createEnvelope fills eventId/occurredAt/version and keeps system actor + resync reason', () => {
    const env = createEnvelope({
      type: RoutingKeys.UserRoleAssigned,
      aggregateVersion: 3,
      correlationId: 'abc',
      actor: 'system',
      reason: 'resync',
      payload: { userId: 'u1', roleId: 'r1', roleName: 'admin', roleVersion: 2 },
    });
    expect(env.eventId).toBeTruthy();
    expect(new Date(env.occurredAt).toISOString()).toBe(env.occurredAt);
    expect(env.version).toBe(1);
    expect(env.actor).toBe('system');
    expect(env.reason).toBe('resync');
    expect(isEventEnvelope(env)).toBe(true);
  });

  it('isEventEnvelope rejects incomplete envelopes', () => {
    const env = createEnvelope({
      type: 'user.created',
      aggregateVersion: 1,
      correlationId: 'c',
      actor: { userId: 'u', roles: ['admin'] },
      payload: {},
    });
    const { aggregateVersion, ...rest } = env;
    void aggregateVersion;
    expect(isEventEnvelope(rest)).toBe(false);
    expect(isEventEnvelope(null)).toBe(false);
    expect(isEventEnvelope({ ...env, actor: 42 })).toBe(false);
  });

  it('constants match the shared contract and deterministicEventId is stable', () => {
    expect(EVENTS_EXCHANGE).toBe('toka.events');
    expect(DLX_EXCHANGE).toBe('toka.events.dlx');
    expect(Object.values(RoutingKeys)).toContain('user.role.assigned');
    expect(QueueBindings['audit.events']).toEqual(['user.#', 'auth.#', 'role.#']);
    expect(QueueBindings['auth.user-projection']).toEqual(['user.#', 'role.created', 'role.updated']);
    expect(QueueBindings['agent.ingest']).toEqual(['role.#']);
    expect(deterministicEventId('r1', 2)).toBe(deterministicEventId('r1', 2));
    expect(deterministicEventId('r1', 2)).not.toBe(deterministicEventId('r1', 3));
  });
});
