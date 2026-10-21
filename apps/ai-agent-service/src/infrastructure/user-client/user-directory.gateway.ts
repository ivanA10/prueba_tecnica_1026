import { HttpStatusError, createHttpClient } from '@toka/http-client';
import {
  CallerContext,
  UserDirectoryGateway,
  UserLookupQuery,
  UserSummary,
  UserToolUnavailableError,
} from '../../application/ports/user-directory-gateway.port';

export interface UserGatewayOptions {
  baseUrl: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

/** Read-only lookup against user-service GET /users, forwarding the caller's JWT. */
export class HttpUserDirectoryGateway implements UserDirectoryGateway {
  private readonly http;

  constructor(opts: UserGatewayOptions) {
    this.http = createHttpClient({
      baseUrl: opts.baseUrl,
      timeoutMs: opts.timeoutMs,
      budgetMs: opts.timeoutMs,
      breaker: { failureThreshold: 5, resetTimeoutMs: 15000 },
      fetchImpl: opts.fetchImpl,
    });
  }

  async lookup(q: UserLookupQuery, ctx: CallerContext): Promise<UserSummary[]> {
    try {
      const res = await this.http.request<{ items?: Array<Record<string, unknown>> }>({
        method: 'GET',
        path: '/users?page=1&limit=100',
        headers: { authorization: ctx.authorization },
        correlationId: ctx.correlationId,
        signal: ctx.signal,
      });
      const items = Array.isArray(res.body?.items) ? res.body.items : [];
      const needle = q.query?.trim().toLowerCase();
      return items
        .filter((u) => (!needle || String(u.name ?? '').toLowerCase().includes(needle)) && (!q.role || u.roleId === q.role))
        .slice(0, 20)
        .map((u) => ({
          id: String(u.id),
          name: String(u.name),
          roleId: String(u.roleId),
          status: String(u.status),
        }));
    } catch (err) {
      const status = err instanceof HttpStatusError ? err.status : undefined;
      throw new UserToolUnavailableError(`user-service lookup failed: ${(err as Error).message}`, status);
    }
  }
}
