import * as amqp from 'amqplib';
import {
  CORRELATION_ID_HEADER,
  DLX_EXCHANGE,
  EVENTS_EXCHANGE,
  EventEnvelope,
  RETRY_COUNT_HEADER,
  UnroutableMessageError,
  declareEventTopology,
} from '@toka/contracts';
import type { EventPublisher } from '../../application/ports';
import type { MessageProcessor } from '../../application/projection-handler';

type Conn = Awaited<ReturnType<typeof amqp.connect>>;

export const PROJECTION_QUEUE = 'auth.user-projection';
const RETRY_QUEUE = `${PROJECTION_QUEUE}.retry`;
const DLQ = `${PROJECTION_QUEUE}.dlq`;

interface Log {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
}

/** Thin amqplib adapter: publisher (confirm channel) + projection consumer with retry/DLQ. */
export class AmqpBroker implements EventPublisher {
  private conn?: Conn;
  private channel?: amqp.ConfirmChannel;
  private stopped = false;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly url: string,
    private readonly logger: Log,
  ) {}

  private processor?: MessageProcessor;
  /** messageIds returned as unroutable (`mandatory`); the return frame always precedes the confirm. */
  private readonly returned = new Set<string>();

  setProcessor(p: MessageProcessor): void {
    this.processor = p;
  }

  /** True once the topology is declared and the projection consumer is running. */
  isReady(): boolean {
    return this.channel !== undefined;
  }

  /** Non-blocking: keeps retrying in the background until the broker is available. */
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
      ch.on('return', (msg: amqp.Message) => {
        if (msg.properties.messageId) this.returned.add(msg.properties.messageId);
      });
      // Shared declaration (exchanges + every main queue and binding, incl. role.created for permissions).
      await declareEventTopology(ch);
      await ch.bindQueue(PROJECTION_QUEUE, DLX_EXCHANGE, PROJECTION_QUEUE);
      await ch.assertQueue(RETRY_QUEUE, {
        durable: true,
        arguments: { 'x-dead-letter-exchange': DLX_EXCHANGE, 'x-dead-letter-routing-key': PROJECTION_QUEUE },
      });
      await ch.assertQueue(DLQ, { durable: true });
      await ch.prefetch(10);
      await ch.consume(PROJECTION_QUEUE, (msg) => void this.onMessage(ch, msg));
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

  private async onMessage(ch: amqp.ConfirmChannel, msg: amqp.ConsumeMessage | null): Promise<void> {
    if (!msg) return;
    try {
      const retryCount = Number(msg.properties.headers?.[RETRY_COUNT_HEADER] ?? 0) || 0;
      if (!this.processor) throw new Error('processor not set');
      const action = await this.processor.process(msg.content.toString('utf8'), retryCount);
      const headers = { ...msg.properties.headers };
      if (action.kind === 'retry') {
        headers[RETRY_COUNT_HEADER] = action.retryCount;
        ch.sendToQueue(RETRY_QUEUE, msg.content, {
          persistent: true,
          contentType: 'application/json',
          headers,
          expiration: String(action.delayMs),
        });
      } else if (action.kind === 'dlq') {
        this.logger.warn({ event: 'amqp.dlq', reason: action.reason }, 'message sent to DLQ');
        ch.sendToQueue(DLQ, msg.content, {
          persistent: true,
          contentType: 'application/json',
          headers: { ...headers, 'x-death-reason': action.reason },
        });
      }
      ch.ack(msg);
    } catch (err) {
      this.logger.warn({ event: 'amqp.consume_error', error: String(err) }, 'consumer failure, requeueing');
      ch.nack(msg, false, true);
    }
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
