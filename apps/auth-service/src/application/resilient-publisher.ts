import type { EventEnvelope } from '@toka/contracts';
import type { EventPublisher } from './ports';

export interface WarnLogger {
  warn(obj: Record<string, unknown>, msg?: string): void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Reintenta en memoria; si se agota escribe el sobre como log `audit.fallback` y NO lanza. */
export class ResilientEventPublisher implements EventPublisher {
  constructor(
    private readonly inner: EventPublisher,
    private readonly logger: WarnLogger,
    private readonly retries = 3,
    private readonly backoffMs = 50,
  ) {}

  async publish(envelope: EventEnvelope<unknown>): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.retries; attempt++) {
      try {
        await this.inner.publish(envelope);
        return;
      } catch (err) {
        lastError = err;
        if (attempt < this.retries) await sleep(this.backoffMs * attempt);
      }
    }
    this.logger.warn(
      {
        event: 'audit.fallback',
        error: lastError instanceof Error ? lastError.message : String(lastError),
        envelope,
      },
      'event publish failed after retries',
    );
  }
}
