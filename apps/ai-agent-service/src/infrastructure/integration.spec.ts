import { UserToolUnavailableError } from '../application/ports/user-directory-gateway.port';
import { RedisRateLimiter } from './redis/redis-rate-limiter';
import { LoggerMetricsRecorder } from './metrics/logger-metrics.recorder';
import { HttpUserDirectoryGateway } from './user-client/user-directory.gateway';

const jsonResponse = (status: number, body: unknown) =>
  ({ status, text: async () => JSON.stringify(body) }) as unknown as Response;

describe('HttpUserDirectoryGateway', () => {
  it('forwards the caller JWT and whitelists id, name, roleId, status', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        items: [{ id: '1', name: 'Ana', email: 'a@x.io', roleId: 'r1', status: 'active', passwordHash: 'zzz' }],
      }),
    );
    const gw = new HttpUserDirectoryGateway({ baseUrl: 'http://u', timeoutMs: 100, fetchImpl });
    const out = await gw.lookup({ query: 'an' }, { authorization: 'Bearer tok', correlationId: 'c1' });
    expect(out).toEqual([{ id: '1', name: 'Ana', roleId: 'r1', status: 'active' }]);
    expect(JSON.stringify(out)).not.toMatch(/email|passwordHash/);
    const init = fetchImpl.mock.calls[0][1];
    expect(init.headers.authorization).toBe('Bearer tok');
    expect(init.headers['x-correlation-id']).toBe('c1');
  });

  it('maps 403 to UserToolUnavailableError', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(403, { message: 'forbidden' }));
    const gw = new HttpUserDirectoryGateway({ baseUrl: 'http://u', timeoutMs: 100, fetchImpl });
    await expect(gw.lookup({}, { authorization: 'Bearer t' })).rejects.toBeInstanceOf(UserToolUnavailableError);
  });
});

describe('RedisRateLimiter', () => {
  it('limits with Retry-After info and fails open when Redis is down', async () => {
    let n = 0;
    const redis = { incr: jest.fn(async () => ++n), expire: jest.fn(async () => 1), ttl: jest.fn(async () => 42) };
    const warn = jest.fn();
    const rl = new RedisRateLimiter(redis, { warn });
    expect((await rl.hit('u:/agent/ask', 1, 60)).allowed).toBe(true);
    expect(redis.incr).toHaveBeenCalledWith('agent:rl:u:/agent/ask');
    expect(await rl.hit('u:/agent/ask', 1, 60)).toEqual({ allowed: false, retryAfterSeconds: 42 });

    const down = new RedisRateLimiter(
      { incr: async () => { throw new Error('down'); }, expire: async () => 0, ttl: async () => 0 },
      { warn },
    );
    expect((await down.hit('k', 1, 60)).allowed).toBe(true);
    expect(warn).toHaveBeenCalled();
  });
});

describe('LoggerMetricsRecorder', () => {
  it('logs metric fields without prompt content', () => {
    const info = jest.fn();
    new LoggerMetricsRecorder({ info }).record({
      provider: 'mock', tokensIn: 1, tokensOut: 2, costUsd: null, latencyMs: 3, ragHits: 1, degraded: false, toolCalls: 0,
    });
    expect(info.mock.calls[0][0]).toMatchObject({ 'llm.tokensIn': 1, 'llm.tokensOut': 2, 'llm.costEstimate': null });
  });
});
