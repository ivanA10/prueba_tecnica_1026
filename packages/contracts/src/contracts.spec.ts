import {
  DLX_EXCHANGE,
  EVENTS_EXCHANGE,
  QueueBindings,
  RoutingKeys,
  createEnvelope,
  deterministicEventId,
  isEventEnvelope,
} from './index';

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
    expect(QueueBindings['auth.user-projection']).toEqual(['user.#', 'role.updated']);
    expect(QueueBindings['agent.ingest']).toEqual(['role.#']);
    expect(deterministicEventId('r1', 2)).toBe(deterministicEventId('r1', 2));
    expect(deterministicEventId('r1', 2)).not.toBe(deterministicEventId('r1', 3));
  });
});
