import { CircuitOpenError } from './errors';

export type BreakerState = 'closed' | 'open' | 'half-open';

export interface BreakerOptions {
  /** Consecutive failures that open the circuit. */
  failureThreshold: number;
  /** Time in open state before a single probe is allowed. */
  resetTimeoutMs: number;
  now?: () => number;
}

export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private current: BreakerState = 'closed';
  private readonly now: () => number;

  constructor(private readonly opts: BreakerOptions) {
    this.now = opts.now ?? Date.now;
  }

  get state(): BreakerState {
    return this.current;
  }

  /** Throws CircuitOpenError when the call must not proceed. */
  acquire(): void {
    if (this.current === 'open') {
      if (this.now() - this.openedAt < this.opts.resetTimeoutMs) throw new CircuitOpenError();
      this.current = 'half-open';
      return;
    }
    if (this.current === 'half-open') throw new CircuitOpenError('Circuit breaker probe in flight');
  }

  onSuccess(): void {
    this.failures = 0;
    this.current = 'closed';
  }

  onFailure(): void {
    this.failures += 1;
    if (this.current === 'half-open' || this.failures >= this.opts.failureThreshold) {
      this.current = 'open';
      this.openedAt = this.now();
    }
  }

  /** Outcome that says nothing about the dependency (caller abort): free a pending probe. */
  onNeutral(): void {
    if (this.current === 'half-open') this.current = 'open';
  }
}
