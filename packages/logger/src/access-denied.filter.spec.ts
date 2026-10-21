import 'reflect-metadata';
import { ArgumentsHost, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AccessDeniedExceptionFilter } from './access-denied.filter';
import { correlationIdMiddleware } from './correlation';

function host(req: object) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const h = { switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({ status }) }) } as unknown as ArgumentsHost;
  return { h, status, json };
}

describe('AccessDeniedExceptionFilter', () => {
  it('logs access.denied for 401/403 and returns the Nest error body', () => {
    const logger = { warn: jest.fn() };
    const filter = new AccessDeniedExceptionFilter(logger as never);
    const { h, status, json } = host({ originalUrl: '/x', user: { sub: 'u1' } });

    correlationIdMiddleware({ headers: { 'x-correlation-id': 'cid-1' } }, { setHeader: jest.fn() }, () => {
      filter.catch(new ForbiddenException(), h);
      filter.catch(new UnauthorizedException(), h);
    });

    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'access.denied', statusCode: 403, route: '/x', userId: 'u1', correlationId: 'cid-1' }),
      expect.any(String),
    );
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });
});
