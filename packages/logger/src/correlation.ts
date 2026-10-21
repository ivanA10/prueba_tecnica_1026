import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export const CORRELATION_HEADER = 'x-correlation-id';

const storage = new AsyncLocalStorage<{ correlationId: string }>();

export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

interface ReqLike {
  headers: Record<string, string | string[] | undefined>;
}
interface ResLike {
  setHeader(name: string, value: string): unknown;
}

export function correlationIdMiddleware(req: ReqLike, res: ResLike, next: (err?: unknown) => void): void {
  const incoming = req.headers[CORRELATION_HEADER];
  const raw = Array.isArray(incoming) ? incoming[0] : incoming;
  const correlationId = raw && raw.trim() ? raw.trim() : randomUUID();
  res.setHeader(CORRELATION_HEADER, correlationId);
  storage.run({ correlationId }, () => next());
}
