import {
  LlmProvider,
  LlmRequest,
  LlmResponse,
  LlmUnavailableError,
} from '../../application/ports/llm-provider.port';

export interface ResilientOptions {
  maxConcurrency: number;
  breakerThreshold: number;
  breakerResetMs: number;
  now?: () => number;
}

/** Decorator adding a concurrency semaphore and a consecutive-failure circuit breaker. */
export class ResilientLlmProvider implements LlmProvider {
  private active = 0;
  private waiters: Array<() => void> = [];
  private failures = 0;
  private openedAt: number | null = null;
  private readonly now: () => number;

  constructor(
    private readonly inner: LlmProvider,
    private readonly opts: ResilientOptions,
  ) {
    this.now = opts.now ?? Date.now;
  }

  get name(): string {
    return this.inner.name;
  }

  async generate(req: LlmRequest): Promise<LlmResponse> {
    if (this.openedAt !== null) {
      if (this.now() - this.openedAt < this.opts.breakerResetMs) {
        throw new LlmUnavailableError('LLM circuit open');
      }
      this.openedAt = null; // half-open: let one attempt through
    }
    await this.acquire();
    try {
      const res = await this.inner.generate(req);
      this.failures = 0;
      return res;
    } catch (err) {
      const status = err instanceof LlmUnavailableError ? err.status : undefined;
      const clientError = status !== undefined && status >= 400 && status < 500 && status !== 429;
      if (!clientError && !req.signal?.aborted) {
        this.failures += 1;
        if (this.failures >= this.opts.breakerThreshold) this.openedAt = this.now();
      }
      throw err;
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.opts.maxConcurrency) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiters.push(() => resolve()));
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) next();
    else this.active -= 1;
  }
}
