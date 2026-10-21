import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { Logger } from 'pino';
import { getCorrelationId } from './correlation';

interface HttpReq {
  originalUrl?: string;
  url?: string;
  route?: { path?: string };
  user?: { sub?: string; userId?: string; id?: string };
}
interface HttpRes {
  status(code: number): { json(body: unknown): unknown };
}

/** Logs 401/403 as `access.denied` (warn) and returns the standard Nest error body. */
@Catch(HttpException)
export class AccessDeniedExceptionFilter implements ExceptionFilter<HttpException> {
  constructor(private readonly logger: Logger) {}

  catch(exception: HttpException, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<HttpReq>();
    const res = http.getResponse<HttpRes>();
    const statusCode = exception.getStatus();

    if (statusCode === 401 || statusCode === 403) {
      this.logger.warn(
        {
          event: 'access.denied',
          statusCode,
          route: req.route?.path ?? req.originalUrl ?? req.url,
          userId: req.user?.sub ?? req.user?.userId ?? req.user?.id,
          correlationId: getCorrelationId(),
        },
        'access denied',
      );
    }

    const body = exception.getResponse();
    res.status(statusCode).json(typeof body === 'string' ? { statusCode, message: body } : body);
  }
}
