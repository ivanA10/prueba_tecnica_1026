import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  CORRELATION_ID_HEADER,
  EVENTS_EXCHANGE,
  EventEnvelope,
  UnroutableMessageError,
  declareEventTopology,
} from '@toka/contracts';
import { PrismaClient } from './generated/prisma';
import { UserConfig } from './config';
import { USER_CONFIG } from './users.service';

export interface EventPublisher {
  publish(routingKey: string, envelope: EventEnvelope<unknown>): Promise<void>;
  isReady(): Promise<boolean>;
}
export const EVENT_PUBLISHER = 'EVENT_PUBLISHER';

interface OutboxRow {
  seq: bigint;
  type: string;
  envelope: EventEnvelope<unknown>;
}

@Injectable()
export class OutboxPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(OutboxPublisher.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaClient,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
    @Inject(USER_CONFIG) private readonly config: Pick<UserConfig, 'outboxBatch' | 'outboxPollMs'>,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.flush(), this.config.outboxPollMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Publishes pending rows in `seq` order; stops (leaving rows pending) on first broker failure. */
  async flush(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<OutboxRow[]>`
            SELECT seq, type, envelope FROM outbox_events
            WHERE published_at IS NULL ORDER BY seq LIMIT ${this.config.outboxBatch}
            FOR UPDATE SKIP LOCKED`;
          let published = 0;
          for (const row of rows) {
            try {
              await this.publisher.publish(row.type, row.envelope);
            } catch (err) {
              this.log.warn(`outbox publish failed, will retry: ${(err as Error).message}`);
              await tx.outboxEvent.update({ where: { seq: row.seq }, data: { attempts: { increment: 1 } } });
              break;
            }
            await tx.outboxEvent.update({ where: { seq: row.seq }, data: { publishedAt: new Date() } });
            published++;
          }
          return published;
        },
        { timeout: 30000 },
      );
    } catch (err) {
      this.log.warn(`outbox flush failed: ${(err as Error).message}`);
      return 0;
    } finally {
      this.running = false;
    }
  }
}

interface AmqpChannelLike {
  assertExchange(name: string, type: string, opts: object): Promise<unknown>;
  assertQueue(name: string, opts: object): Promise<unknown>;
  bindQueue(queue: string, exchange: string, key: string): Promise<unknown>;
  publish(
    exchange: string,
    key: string,
    content: Buffer,
    opts: object,
    cb: (err: unknown) => void,
  ): boolean;
  close(): Promise<void>;
  on(event: string, cb: (...args: unknown[]) => void): unknown;
}
interface AmqpConnectionLike {
  createConfirmChannel(): Promise<AmqpChannelLike>;
  close(): Promise<void>;
  on(event: string, cb: (...args: unknown[]) => void): unknown;
}
export type AmqpConnect = (url: string) => Promise<AmqpConnectionLike>;

/**
 * Confirm-channel publisher with lazy (re)connection. Declares the consumer queues itself and
 * publishes with `mandatory`, so an event is never marked as published unless a queue holds it.
 */
export class AmqpEventPublisher implements EventPublisher {
  private conn?: AmqpConnectionLike;
  private channel?: AmqpChannelLike;
  /** messageIds the broker returned as unroutable; the return frame always precedes the confirm. */
  private readonly returned = new Set<string>();

  constructor(
    private readonly url: string,
    private readonly connect: AmqpConnect,
  ) {}

  async isReady(): Promise<boolean> {
    try {
      await this.ensure();
      return true;
    } catch {
      return false;
    }
  }

  private reset = (): void => {
    this.channel = undefined;
    this.conn = undefined;
  };

  private async ensure(): Promise<AmqpChannelLike> {
    if (this.channel) return this.channel;
    const conn = await this.connect(this.url);
    conn.on('error', this.reset);
    conn.on('close', this.reset);
    const ch = await conn.createConfirmChannel();
    ch.on('error', this.reset);
    ch.on('close', this.reset);
    ch.on('return', (msg) => {
      const id = (msg as { properties?: { messageId?: string } } | undefined)?.properties?.messageId;
      if (id) this.returned.add(id);
    });
    await declareEventTopology(ch);
    this.conn = conn;
    this.channel = ch;
    return ch;
  }

  async publish(routingKey: string, envelope: EventEnvelope<unknown>): Promise<void> {
    const ch = await this.ensure();
    await new Promise<void>((resolve, reject) => {
      ch.publish(
        EVENTS_EXCHANGE,
        routingKey,
        Buffer.from(JSON.stringify(envelope)),
        {
          persistent: true,
          mandatory: true,
          messageId: envelope.eventId,
          contentType: 'application/json',
          headers: { [CORRELATION_ID_HEADER]: envelope.correlationId },
        },
        (err) => {
          if (err) return reject(err instanceof Error ? err : new Error(String(err)));
          if (this.returned.delete(envelope.eventId)) return reject(new UnroutableMessageError(routingKey));
          resolve();
        },
      );
    }).catch(async (err) => {
      if (err instanceof UnroutableMessageError) {
        // Queues were deleted after connecting: re-declare so the next outbox poll can deliver.
        await declareEventTopology(ch).catch(() => undefined);
      } else {
        this.reset();
      }
      throw err;
    });
  }

  async close(): Promise<void> {
    await this.conn?.close().catch(() => undefined);
    this.reset();
  }
}
