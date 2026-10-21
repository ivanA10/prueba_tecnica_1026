import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import type { Logger } from 'pino';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

interface HttpReq {
  method?: string;
  originalUrl?: string;
  url?: string;
  route?: { path?: string };
  user?: { sub?: string; userId?: string; id?: string };
}
interface HttpRes {
  statusCode: number;
}

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: Logger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<HttpReq>();
    const res = http.getResponse<HttpRes>();
    const start = Date.now();
    const base = () => ({
      route: req.route?.path ?? req.originalUrl ?? req.url,
      method: req.method,
      userId: req.user?.sub ?? req.user?.userId ?? req.user?.id,
      latencyMs: Date.now() - start,
    });

    return next.handle().pipe(
      tap(() => {
        this.logger.info({ ...base(), statusCode: res.statusCode }, 'request completed');
      }),
      catchError((err: unknown) => {
        const statusCode = err instanceof HttpException ? err.getStatus() : 500;
        if (statusCode === 403) {
          this.logger.warn({ ...base(), statusCode, event: 'access.denied' }, 'access denied');
        } else {
          this.logger.error({ ...base(), statusCode }, 'request failed');
        }
        return throwError(() => err);
      }),
    );
  }
}
