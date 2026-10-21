import { createHttpClient, CircuitOpenError, HttpStatusError, HttpTimeoutError } from './index';

const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
const noSleep = async () => undefined;

describe('http-client', () => {
  it('retries idempotent GET on 503 but POST only once', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(reply(503))
      .mockResolvedValueOnce(reply(200, { ok: true }));
    const client = createHttpClient({ baseUrl: 'http://x', timeoutMs: 100, retries: 2, fetchImpl, sleep: noSleep });
    await expect(client.request({ method: 'GET', path: '/a' })).resolves.toEqual({ status: 200, body: { ok: true } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    fetchImpl.mockReset().mockImplementation(async () => reply(503));
    await expect(client.request({ method: 'POST', path: '/a', body: { n: 1 } })).rejects.toBeInstanceOf(HttpStatusError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not retry 4xx nor count them as breaker failures; forwards headers', async () => {
    const fetchImpl = jest.fn().mockImplementation(async () => reply(404));
    const client = createHttpClient({
      baseUrl: 'http://x/',
      timeoutMs: 100,
      retries: 3,
      breaker: { failureThreshold: 1, resetTimeoutMs: 1000 },
      fetchImpl,
      sleep: noSleep,
    });
    for (let i = 0; i < 2; i++) {
      await expect(
        client.request({ method: 'GET', path: 'u', correlationId: 'c-1', headers: { authorization: 'Bearer t' } }),
      ).rejects.toMatchObject({ status: 404 });
    }
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(client.breaker?.state).toBe('closed');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://x/u');
    expect(init.headers).toMatchObject({ 'x-correlation-id': 'c-1', authorization: 'Bearer t' });
  });

  it('opens breaker on consecutive failures, fails fast, then recovers', async () => {
    let t = 0;
    const fetchImpl = jest.fn().mockImplementation(async () => reply(500));
    const client = createHttpClient({
      baseUrl: 'http://x',
      timeoutMs: 100,
      breaker: { failureThreshold: 2, resetTimeoutMs: 1000 },
      fetchImpl,
      now: () => t,
    });
    for (let i = 0; i < 2; i++) await expect(client.request({ method: 'POST', path: '/a' })).rejects.toBeInstanceOf(HttpStatusError);
    await expect(client.request({ method: 'GET', path: '/a' })).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    t = 1000;
    fetchImpl.mockImplementation(async () => reply(200));
    await expect(client.request({ method: 'GET', path: '/a' })).resolves.toMatchObject({ status: 200 });
    expect(client.breaker?.state).toBe('closed');
  });

  it('reopens on failed half-open probe', async () => {
    let t = 0;
    const fetchImpl = jest.fn().mockImplementation(async () => reply(500));
    const client = createHttpClient({
      baseUrl: 'http://x',
      timeoutMs: 100,
      breaker: { failureThreshold: 1, resetTimeoutMs: 10 },
      fetchImpl,
      now: () => t,
    });
    await expect(client.request({ method: 'POST', path: '/a' })).rejects.toBeInstanceOf(HttpStatusError);
    t = 10;
    await expect(client.request({ method: 'POST', path: '/a' })).rejects.toBeInstanceOf(HttpStatusError);
    expect(client.breaker?.state).toBe('open');
    await expect(client.request({ method: 'POST', path: '/a' })).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it('aborts on timeout, and stops retrying when the budget is exhausted', async () => {
    const hang = jest.fn((_u: string, init: RequestInit) =>
      new Promise<Response>((_, rej) => init.signal?.addEventListener('abort', () => rej(new Error('aborted')))),
    );
    const client = createHttpClient({
      baseUrl: 'http://x',
      timeoutMs: 20,
      retries: 5,
      backoffBaseMs: 1,
      budgetMs: 60,
      fetchImpl: hang as unknown as typeof fetch,
    });
    await expect(client.request({ method: 'GET', path: '/slow' })).rejects.toBeInstanceOf(HttpTimeoutError);
    expect(hang.mock.calls.length).toBeLessThan(6);
  });
});
