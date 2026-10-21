import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DLX_EXCHANGE, RETRY_COUNT_HEADER, declareEventTopology } from '@toka/contracts';
import { AuditConfig } from './config';
import { AuditProcessor } from './audit.processor';

export const AUDIT_CONFIG = 'AUDIT_CONFIG';
export const AMQP_CONNECT = 'AMQP_CONNECT';

export const QUEUE = 'audit.events';
export const RETRY_QUEUE = 'audit.events.retry';
export const DLQ = 'audit.events.dlq';

export interface AmqpMessage {
  content: Buffer;
  fields: { routingKey: string };
  properties: { headers?: Record<string, unknown>; messageId?: string };
}
export interface AmqpChannelLike {
  assertExchange(name: string, type: string, opts: object): Promise<unknown>;
  assertQueue(name: string, opts: object): Promise<unknown>;
  bindQueue(queue: string, exchange: string, key: string): Promise<unknown>;
  prefetch(n: number): Promise<unknown> | unknown;
  consume(queue: string, cb: (msg: AmqpMessage | null) => void): Promise<unknown>;
  publish(exchange: string, key: string, content: Buffer, opts: object, cb: (err: unknown) => void): boolean;
  ack(msg: AmqpMessage): void;
  nack(msg: AmqpMessage, allUpTo?: boolean, requeue?: boolean): void;
  close(): Promise<void>;
}
export interface AmqpConnectionLike {
  createConfirmChannel(): Promise<AmqpChannelLike>;
  close(): Promise<void>;
  on(event: string, cb: (...args: unknown[]) => void): unknown;
}
export type AmqpConnect = (url: string) => Promise<AmqpConnectionLike>;

@Injectable()
export class AuditConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(AuditConsumer.name);
  private conn?: AmqpConnectionLike;
  private channel?: AmqpChannelLike;
  private stopped = false;
  private attempt = 0;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(
    private readonly processor: AuditProcessor,
    @Inject(AUDIT_CONFIG) private readonly config: AuditConfig,
    @Inject(AMQP_CONNECT) private readonly connect: AmqpConnect,
  ) {}

  onModuleInit(): void {
    void this.start();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    await this.conn?.close().catch(() => undefined);
  }

  isConnected(): boolean {
    return this.channel !== undefined;
  }

  async start(): Promise<void> {
    try {
      const conn = await this.connect(this.config.rabbitmqUrl);
      conn.on('error', () => undefined);
      conn.on('close', () => this.onClosed());
      const ch = await conn.createConfirmChannel();
      await this.declareTopology(ch);
      await ch.prefetch(this.config.prefetch);
      await ch.consume(QUEUE, (msg) => {
        if (msg) void this.handle(ch, msg);
      });
      this.conn = conn;
      this.channel = ch;
      this.attempt = 0;
      this.log.log('audit consumer started');
    } catch (err) {
      this.log.warn(`audit consumer start failed: ${(err as Error).message}`);
      this.onClosed();
    }
  }

  private onClosed(): void {
    this.channel = undefined;
    this.conn = undefined;
    if (this.stopped || this.reconnectTimer) return;
    const delay = Math.min(30000, 1000 * 2 ** this.attempt++);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.start();
    }, delay);
    this.reconnectTimer.unref();
  }

  async declareTopology(ch: AmqpChannelLike): Promise<void> {
    // Exchanges + main queues/bindings shared with the publishers (identical queue arguments).
    await declareEventTopology(ch);
    await ch.assertQueue(RETRY_QUEUE, {
      durable: true,
      arguments: {
        'x-message-ttl': this.config.retryTtlMs,
        'x-dead-letter-exchange': DLX_EXCHANGE,
        'x-dead-letter-routing-key': QUEUE,
      },
    });
    await ch.assertQueue(DLQ, { durable: true });
    await ch.bindQueue(QUEUE, DLX_EXCHANGE, QUEUE);
    await ch.bindQueue(RETRY_QUEUE, DLX_EXCHANGE, RETRY_QUEUE);
    await ch.bindQueue(DLQ, DLX_EXCHANGE, DLQ);
  }

  /** Publishes on the confirm channel and resolves only once the broker has confirmed the message. */
  private publishConfirmed(ch: AmqpChannelLike, key: string, content: Buffer, opts: object): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      ch.publish(DLX_EXCHANGE, key, content, opts, (err) => (err ? reject(err) : resolve()));
    });
  }

  /** Ack only after the retry/DLQ republish is confirmed; on any failure nack with requeue (no loss). */
  async handle(ch: AmqpChannelLike, msg: AmqpMessage): Promise<void> {
    try {
      const headers = { ...(msg.properties.headers ?? {}) };
      const retryCount = Number(headers[RETRY_COUNT_HEADER] ?? 0) || 0;
      const outcome = await this.processor.process(msg.content, retryCount);
      const opts = { persistent: true, contentType: 'application/json' };
      if (outcome.action === 'retry') {
        await this.publishConfirmed(ch, RETRY_QUEUE, msg.content, {
          ...opts,
          headers: { ...headers, [RETRY_COUNT_HEADER]: retryCount + 1 },
        });
      } else if (outcome.action === 'dlq') {
        this.log.error(`message to DLQ (${outcome.error}) messageId=${msg.properties.messageId ?? 'n/a'}`);
        await this.publishConfirmed(ch, DLQ, msg.content, {
          ...opts,
          headers: { ...headers, 'x-error': outcome.error, 'x-failed-at': new Date().toISOString() },
        });
      }
      ch.ack(msg);
    } catch (err) {
      this.log.warn(`consumer failure, requeueing: ${(err as Error).message}`);
      ch.nack(msg, false, true);
    }
  }
}
