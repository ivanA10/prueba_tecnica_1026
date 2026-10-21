import * as amqp from 'amqplib';
import { CORRELATION_ID_HEADER, DLX_EXCHANGE, EVENTS_EXCHANGE, EventEnvelope } from '@toka/contracts';
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

  constructor(
    private readonly url: string,
    private readonly logger: Log,
  ) {}

  start(): void {
    void this.connect();
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
      await ch.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });
      await ch.assertExchange(DLX_EXCHANGE, 'direct', { durable: true });
      this.conn = conn;
      this.channel = ch;
      this.logger.info({ event: 'amqp.connected' }, 'AMQP connected');
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
          contentType: 'application/json',
          messageId: envelope.eventId,
          headers: { [CORRELATION_ID_HEADER]: envelope.correlationId },
        },
        (err) => (err ? reject(err) : resolve()),
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
