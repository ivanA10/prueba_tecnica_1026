import { createHash, randomUUID } from 'crypto';

export type EventActor = { userId: string; roles: string[] } | 'system';

export interface EventEnvelope<T = Record<string, unknown>> {
  eventId: string;
  type: string;
  version: number;
  aggregateVersion: number;
  occurredAt: string;
  correlationId: string;
  actor: EventActor;
  reason?: string;
  payload: T;
}

export interface CreateEnvelopeInput<T> {
  type: string;
  aggregateVersion: number;
  correlationId: string;
  actor: EventActor;
  payload: T;
  reason?: string;
  eventId?: string;
  occurredAt?: string;
  version?: number;
}

export function createEnvelope<T>(input: CreateEnvelopeInput<T>): EventEnvelope<T> {
  const envelope: EventEnvelope<T> = {
    eventId: input.eventId ?? randomUUID(),
    type: input.type,
    version: input.version ?? 1,
    aggregateVersion: input.aggregateVersion,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    correlationId: input.correlationId,
    actor: input.actor,
    payload: input.payload,
  };
  if (input.reason !== undefined) envelope.reason = input.reason;
  return envelope;
}

const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function isActor(v: unknown): boolean {
  if (v === 'system') return true;
  if (typeof v !== 'object' || v === null) return false;
  const a = v as Record<string, unknown>;
  return isString(a.userId) && Array.isArray(a.roles);
}

export function isEventEnvelope(x: unknown): x is EventEnvelope<unknown> {
  if (typeof x !== 'object' || x === null) return false;
  const e = x as Record<string, unknown>;
  return (
    isString(e.eventId) &&
    isString(e.type) &&
    isNumber(e.version) &&
    isNumber(e.aggregateVersion) &&
    isString(e.occurredAt) &&
    isString(e.correlationId) &&
    isActor(e.actor) &&
    (e.reason === undefined || typeof e.reason === 'string') &&
    'payload' in e
  );
}

/** Stable UUID-shaped id derived from roleId + aggregateVersion (resync idempotency). */
export function deterministicEventId(roleId: string, aggregateVersion: number): string {
  const h = createHash('sha256').update(`${roleId}:${aggregateVersion}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
