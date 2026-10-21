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
  'auth.user-projection': ['user.#', 'role.updated'],
  'agent.ingest': ['role.#'],
} as const;
