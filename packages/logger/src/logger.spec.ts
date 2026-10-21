import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { Writable } from 'node:stream';
import { correlationIdMiddleware, createLogger, getCorrelationId, RequestLoggingInterceptor } from './index';

function sink() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  return { lines, destination, last: () => JSON.parse(lines[lines.length - 1]) };
}

function ctx(req: object, res: object): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) } as unknown as ExecutionContext;
}

describe('logger', () => {
  it('emits ADR-007 JSON fields and redacts secrets', () => {
    const s = sink();
    createLogger({ service: 'svc-x', destination: s.destination }).info({ password: 'p', user: { token: 't' }, authorization: 'Bearer x' }, 'hi');
    const l = s.last();
    expect(l.service).toBe('svc-x');
    expect(l.level).toBe('info');
    expect(new Date(l.timestamp).toISOString()).toBe(l.timestamp);
    expect(l.password).toBe('[REDACTED]');
    expect(l.user.token).toBe('[REDACTED]');
    expect(l.authorization).toBe('[REDACTED]');
  });

  it('propagates x-correlation-id into logs and response header', () => {
    const s = sink();
    const log = createLogger({ service: 'svc', destination: s.destination });
    const setHeader = jest.fn();
    correlationIdMiddleware({ headers: { 'x-correlation-id': 'abc' } }, { setHeader }, () => log.info('x'));
    expect(s.last().correlationId).toBe('abc');
    expect(setHeader).toHaveBeenCalledWith('x-correlation-id', 'abc');
  });

  it('generates a correlationId when absent', () => {
    let id: string | undefined;
    correlationIdMiddleware({ headers: {} }, { setHeader: jest.fn() }, () => {
      id = getCorrelationId();
    });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(getCorrelationId()).toBeUndefined();
  });

  it('interceptor logs route/status/latency/userId and access.denied on 403', async () => {
    const s = sink();
    const i = new RequestLoggingInterceptor(createLogger({ service: 'svc', destination: s.destination }));
    const req = { method: 'GET', originalUrl: '/a', user: { sub: 'u1' } };
    await lastValueFrom(i.intercept(ctx(req, { statusCode: 200 }), { handle: () => of(1) }));
    const ok = s.last();
    expect(ok).toMatchObject({ route: '/a', statusCode: 200, userId: 'u1' });
    expect(typeof ok.latencyMs).toBe('number');

    await expect(
      lastValueFrom(i.intercept(ctx(req, { statusCode: 200 }), { handle: () => throwError(() => new ForbiddenException()) })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(s.last()).toMatchObject({ event: 'access.denied', statusCode: 403 });
  });
});
