export class HttpTimeoutError extends Error {
  constructor(
    public readonly timeoutMs: number,
    public readonly url: string,
  ) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`);
    this.name = 'HttpTimeoutError';
  }
}

export class CircuitOpenError extends Error {
  constructor(message = 'Circuit breaker is open') {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

export class HttpStatusError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    public readonly url: string,
  ) {
    super(`HTTP ${status} from ${url}`);
    this.name = 'HttpStatusError';
  }
}
