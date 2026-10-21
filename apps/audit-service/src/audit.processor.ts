import { Inject, Injectable, Optional } from '@nestjs/common';
import { EventEnvelope, isEventEnvelope } from '@toka/contracts';
import { createLogger } from '@toka/logger';
import { LOGGER } from './logging';

export interface AuditDocument {
  eventId: string;
  type: string;
  version: number;
  aggregateVersion: number;
  occurredAt: Date;
  receivedAt: Date;
  correlationId: string;
  actorUserId?: string;
  actorRoles: string[];
  actorIsSystem: boolean;
  routingKey: string;
  payload: unknown;
}

export interface AuditQuery {
  actor?: string;
  type?: string;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}

export interface AuditRepository {
  /** Append-only insert; a duplicate eventId resolves to 'duplicate'. */
  insert(doc: AuditDocument): Promise<'inserted' | 'duplicate'>;
  query(q: AuditQuery): Promise<{ items: AuditDocument[]; total: number }>;
}
export const AUDIT_REPOSITORY = 'AUDIT_REPOSITORY';
export const AUDIT_OPTIONS = 'AUDIT_OPTIONS';

export type Outcome = { action: 'ack' } | { action: 'retry' } | { action: 'dlq'; error: string };

@Injectable()
export class AuditProcessor {
  private readonly log: ReturnType<typeof createLogger>;

  constructor(
    @Inject(AUDIT_REPOSITORY) private readonly repo: AuditRepository,
    @Inject(AUDIT_OPTIONS) private readonly options: { maxRetries: number },
    @Optional() @Inject(LOGGER) logger?: ReturnType<typeof createLogger>,
  ) {
    this.log = logger ?? createLogger({ service: 'audit-service', level: 'silent' });
  }

  /** Decides what to do with a raw message: ack, retry (transient failure) or dlq (permanent / exhausted). */
  async process(content: Buffer, retryCount: number): Promise<Outcome> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content.toString('utf8'));
    } catch {
      this.log.warn({ event: 'audit.rejected', reason: 'invalid JSON body' }, 'audit message rejected');
      return { action: 'dlq', error: 'invalid JSON body' };
    }
    if (!isEventEnvelope(parsed)) {
      this.log.warn({ event: 'audit.rejected', reason: 'invalid event envelope' }, 'audit message rejected');
      return { action: 'dlq', error: 'invalid event envelope' };
    }
    const env = parsed as EventEnvelope<unknown>;

    if (env.reason === 'resync') {
      this.log.debug(
        { event: 'audit.skipped', eventId: env.eventId, type: env.type, correlationId: env.correlationId },
        'resync event skipped',
      );
      return { action: 'ack' };
    }

    const isSystem = env.actor === 'system';
    const doc: AuditDocument = {
      eventId: env.eventId,
      type: env.type,
      version: env.version,
      aggregateVersion: env.aggregateVersion,
      occurredAt: new Date(env.occurredAt),
      receivedAt: new Date(),
      correlationId: env.correlationId,
      actorUserId: isSystem ? undefined : (env.actor as { userId: string }).userId,
      actorRoles: isSystem ? [] : (env.actor as { roles: string[] }).roles,
      actorIsSystem: isSystem,
      routingKey: env.type,
      payload: env.payload,
    };
    try {
      const result = await this.repo.insert(doc); // 'duplicate' counts as success (idempotent)
      this.log.info(
        {
          event: result === 'inserted' ? 'audit.inserted' : 'audit.duplicate',
          eventId: env.eventId,
          type: env.type,
          correlationId: env.correlationId,
        },
        result === 'inserted' ? 'audit event stored' : 'audit event duplicate ignored',
      );
      return { action: 'ack' };
    } catch (err) {
      this.log.warn(
        {
          event: 'audit.insert_failed',
          eventId: env.eventId,
          type: env.type,
          correlationId: env.correlationId,
          retry: retryCount,
          error: (err as Error).message,
        },
        'audit insert failed',
      );
      return retryCount >= this.options.maxRetries
        ? { action: 'dlq', error: `retries exhausted: ${(err as Error).message}` }
        : { action: 'retry' };
    }
  }

  async query(q: AuditQuery) {
    const { items, total } = await this.repo.query(q);
    return {
      items: items.map((d) => ({
        eventId: d.eventId,
        type: d.type,
        actorUserId: d.actorIsSystem ? 'system' : d.actorUserId,
        occurredAt: d.occurredAt,
        correlationId: d.correlationId,
        payload: d.payload,
      })),
      page: q.page,
      limit: q.limit,
      total,
    };
  }
}
