export const EVENTS_EXCHANGE = 'toka.events';
export const DLX_EXCHANGE = 'toka.events.dlx';

export const CORRELATION_ID_HEADER = 'x-correlation-id';
export const RETRY_COUNT_HEADER = 'x-retry-count';

export const RoutingKeys = {
  UserCreated: 'user.created',
  UserUpdated: 'user.updated',
  UserDeleted: 'user.deleted',
  UserRoleAssigned: 'user.role.assigned',
  RoleCreated: 'role.created',
  RoleUpdated: 'role.updated',
  RolePermissionsChanged: 'role.permissions.changed',
  AuthLoginSucceeded: 'auth.login.succeeded',
  AuthLoginFailed: 'auth.login.failed',
} as const;

export type RoutingKey = (typeof RoutingKeys)[keyof typeof RoutingKeys];

export const QueueBindings = {
  'audit.events': ['user.#', 'auth.#', 'role.#'],
  'auth.user-projection': ['user.#', 'role.created', 'role.updated'],
  'agent.ingest': ['role.#'],
} as const;

/**
 * Main consumer queues that must exist before anything is published: RabbitMQ silently drops
 * messages routed to an exchange without bound queues. Declared identically by publishers and
 * consumers (assertQueue fails with PRECONDITION_FAILED if the arguments differ).
 */
export const MainQueues = [
  {
    name: 'audit.events',
    options: {
      durable: true,
      arguments: { 'x-dead-letter-exchange': DLX_EXCHANGE, 'x-dead-letter-routing-key': 'audit.events.dlq' },
    },
  },
  { name: 'auth.user-projection', options: { durable: true } },
] as const;

export interface TopologyChannel {
  assertExchange(name: string, type: string, opts: object): Promise<unknown>;
  assertQueue(name: string, opts: object): Promise<unknown>;
  bindQueue(queue: string, exchange: string, key: string): Promise<unknown>;
}

/** Idempotent: exchanges + main queues + their bindings on the events exchange. */
export async function declareEventTopology(ch: TopologyChannel): Promise<void> {
  await ch.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });
  await ch.assertExchange(DLX_EXCHANGE, 'direct', { durable: true });
  for (const q of MainQueues) {
    await ch.assertQueue(q.name, q.options);
    for (const key of QueueBindings[q.name]) await ch.bindQueue(q.name, EVENTS_EXCHANGE, key);
  }
}

/** Error raised when the broker returns a `mandatory` message because no queue matched it. */
export class UnroutableMessageError extends Error {
  constructor(routingKey: string) {
    super(`unroutable message (no bound queue) for routing key ${routingKey}`);
    this.name = 'UnroutableMessageError';
  }
}
