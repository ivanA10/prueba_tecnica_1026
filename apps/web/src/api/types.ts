export interface User {
  id: string;
  name: string;
  email: string;
  roleId: string;
  status: 'PENDING' | 'ACTIVE' | 'DISABLED';
}
export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}
export interface Role {
  id: string;
  name: string;
  permissions: string[];
  version?: number;
}
export interface AuditEvent {
  eventId: string;
  type: string;
  actorUserId: string;
  occurredAt: string;
  correlationId: string;
}
export interface AgentAnswer {
  answer: string;
  degraded: boolean;
  sources: { docId: string; source: string; score: number }[];
  meta?: unknown;
}
export interface TokenResponse {
  accessToken: string;
  expiresIn: number;
}
