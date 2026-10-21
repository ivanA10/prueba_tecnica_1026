export const PERMISSIONS = {
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',
  ROLES_READ: 'roles:read',
  ROLES_WRITE: 'roles:write',
  AUDIT_READ: 'audit:read',
  AGENT_ASK: 'agent:ask',
  AGENT_INGEST: 'agent:ingest',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

export const WILDCARD = '*';

export function hasPermission(granted: readonly string[] | undefined, required: string): boolean {
  if (!granted) return false;
  return granted.includes(WILDCARD) || granted.includes(required);
}

export function isKnownPermission(p: string): p is Permission {
  return (ALL_PERMISSIONS as string[]).includes(p);
}

export const PERMISSION_LABELS: Record<Permission, string> = {
  'users:read': 'Ver usuarios',
  'users:write': 'Gestionar usuarios',
  'roles:read': 'Ver roles',
  'roles:write': 'Gestionar roles',
  'audit:read': 'Ver auditoría',
  'agent:ask': 'Consultar al agente',
  'agent:ingest': 'Cargar conocimiento al agente',
};
