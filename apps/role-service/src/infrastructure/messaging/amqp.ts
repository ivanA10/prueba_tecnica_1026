import * as amqp from 'amqplib';
import {
  CORRELATION_ID_HEADER,
  EVENTS_EXCHANGE,
  EventEnvelope,
  UnroutableMessageError,
  declareEventTopology,
} from '@toka/contracts';
import type { EventPublisher } from '../../application/ports';

type Conn = Awaited<ReturnType<typeof amqp.connect>>;

interface Log {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
}

/** Thin amqplib publisher adapter (confirm channel) with background reconnect. */
export class AmqpPublisher implements EventPublisher {
  private conn?: Conn;
  private channel?: amqp.ConfirmChannel;
  private stopped = false;
  private timer?: NodeJS.Timeout;
  /** messageIds returned as unroutable (`mandatory`); the return frame always precedes the confirm. */
  private readonly returned = new Set<string>();
  private readonly waiters: Array<() => void> = [];

  constructor(
    private readonly url: string,
    private readonly logger: Log,
  ) {}

  start(): void {
    void this.connect();
  }

  isReady(): boolean {
    return this.channel !== undefined;
  }

  /** Resolves true once connected (topology declared), or false after `timeoutMs`. */
  whenReady(timeoutMs: number): Promise<boolean> {
    if (this.channel) return Promise.resolve(true);
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve(false), timeoutMs);
      t.unref();
      this.waiters.push(() => {
        clearTimeout(t);
        resolve(true);
      });
    });
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    try {
      const conn = await amqp.connect(this.url);
      conn.on('error', () => undefined);
      conn.on('close', () => {
        this.channel = undefined;
        this.scheduleReconnect();
      });
      const ch = await conn.createConfirmChannel();
      ch.on('return', (msg: amqp.Message) => {
        if (msg.properties.messageId) this.returned.add(msg.properties.messageId);
      });
      // Consumer queues may not exist yet on a fresh broker: declare them so nothing is dropped.
      await declareEventTopology(ch);
      this.conn = conn;
      this.channel = ch;
      this.logger.info({ event: 'amqp.connected' }, 'AMQP connected');
      this.waiters.splice(0).forEach((w) => w());
    } catch (err) {
      this.logger.warn({ event: 'amqp.unavailable', error: String(err) }, 'AMQP unavailable, retrying');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.connect();
    }, 5000);
  }

  async publish(envelope: EventEnvelope<unknown>): Promise<void> {
    const ch = this.channel;
    if (!ch) throw new Error('AMQP channel not available');
    await new Promise<void>((resolve, reject) => {
      ch.publish(
        EVENTS_EXCHANGE,
        envelope.type,
        Buffer.from(JSON.stringify(envelope)),
        {
          persistent: true,
          mandatory: true,
          contentType: 'application/json',
          messageId: envelope.eventId,
          headers: { [CORRELATION_ID_HEADER]: envelope.correlationId },
        },
        (err) => {
          if (err) return reject(err);
          if (this.returned.delete(envelope.eventId)) return reject(new UnroutableMessageError(envelope.type));
          resolve();
        },
      );
    });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    try {
      await this.channel?.close();
      await this.conn?.close();
    } catch {
      /* ignore */
    }
  }
}
