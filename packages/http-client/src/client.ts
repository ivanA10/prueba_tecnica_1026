import { CircuitBreaker, BreakerOptions } from './breaker';
import { HttpStatusError, HttpTimeoutError } from './errors';

export interface HttpClientOptions {
  baseUrl: string;
  timeoutMs: number;
  /** Max retries after the first attempt (idempotent calls only). */
  retries?: number;
  backoffBaseMs?: number;
  /** Default total budget for a request, retries included. */
  budgetMs?: number;
  breaker?: Omit<BreakerOptions, 'now'> | CircuitBreaker;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

export interface RequestOptions {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  idempotent?: boolean;
  signal?: AbortSignal;
  correlationId?: string;
  budgetMs?: number;
}

export interface HttpResponse<T = unknown> {
  status: number;
  body: T;
}

const IDEMPOTENT = new Set(['GET', 'HEAD', 'PUT', 'DELETE']);

export function createHttpClient(opts: HttpClientOptions) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = opts.random ?? Math.random;
  const now = opts.now ?? Date.now;
  const retries = opts.retries ?? 0;
  const base = opts.backoffBaseMs ?? 200;
  const breaker =
    opts.breaker instanceof CircuitBreaker
      ? opts.breaker
      : opts.breaker
        ? new CircuitBreaker({ ...opts.breaker, now })
        : undefined;

  async function attempt(req: RequestOptions, url: string, timeoutMs: number): Promise<HttpResponse> {
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, timeoutMs);
    const onAbort = () => ctrl.abort();
    req.signal?.addEventListener('abort', onAbort, { once: true });
    if (req.signal?.aborted) ctrl.abort();

    const headers: Record<string, string> = { ...req.headers };
    if (req.correlationId) headers['x-correlation-id'] = req.correlationId;
    let payload: string | undefined;
    if (req.body !== undefined) {
      payload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      if (!Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) {
        headers['content-type'] = 'application/json';
      }
    }
    try {
      const res = await fetchImpl(url, { method: req.method, headers, body: payload, signal: ctrl.signal });
      const text = await res.text();
      let body: unknown = text;
      try {
        body = text ? JSON.parse(text) : undefined;
      } catch {
        // non-JSON body stays as text
      }
      return { status: res.status, body };
    } catch (err) {
      if (timedOut) throw new HttpTimeoutError(timeoutMs, url);
      throw err;
    } finally {
      clearTimeout(timer);
      req.signal?.removeEventListener('abort', onAbort);
    }
  }

  async function run(req: RequestOptions): Promise<HttpResponse> {
    const method = req.method.toUpperCase();
    const url = opts.baseUrl.replace(/\/+$/, '') + (req.path.startsWith('/') ? req.path : `/${req.path}`);
    const canRetry = req.idempotent === true || IDEMPOTENT.has(method);
    const maxAttempts = canRetry ? retries + 1 : 1;
    const budget = req.budgetMs ?? opts.budgetMs;
    const start = now();
    let lastError: unknown;

    for (let i = 0; i < maxAttempts; i++) {
      const remaining = budget === undefined ? Infinity : budget - (now() - start);
      try {
        const res = await attempt({ ...req, method }, url, Math.min(opts.timeoutMs, Math.max(remaining, 1)));
        if (res.status < 400) return res;
        const statusErr = new HttpStatusError(res.status, res.body, url);
        if (res.status !== 429 && res.status < 500) throw statusErr; // 4xx: never retried
        lastError = statusErr;
      } catch (err) {
        if (err instanceof HttpStatusError && err.status !== 429 && err.status < 500) throw err;
        if (req.signal?.aborted) throw err; // caller abort: not retried
        lastError = err;
      }
      if (i + 1 >= maxAttempts) break;
      const delay = base * 2 ** i * (0.5 + random() / 2);
      if (budget !== undefined && now() - start + delay >= budget) break;
      await sleep(delay);
    }
    throw lastError;
  }

  return {
    breaker,
    async request<T = unknown>(req: RequestOptions): Promise<HttpResponse<T>> {
      breaker?.acquire();
      try {
        const res = await run(req);
        breaker?.onSuccess();
        return res as HttpResponse<T>;
      } catch (err) {
        const clientError = err instanceof HttpStatusError && err.status < 500 && err.status !== 429;
        if (clientError) breaker?.onSuccess(); // 4xx proves the dependency is alive
        else if (req.signal?.aborted) breaker?.onNeutral();
        else breaker?.onFailure();
        throw err;
      }
    },
  };
}

export type HttpClient = ReturnType<typeof createHttpClient>;
