import { HttpClient, HttpStatusError } from '@toka/http-client';
import {
  AuthCredentialsClient,
  CredentialsConflictError,
  DependencyUnavailableError,
  RoleClient,
  RoleInfo,
  RoleNotFoundError,
} from './ports';

/** client_credentials token provider; caches per audience until shortly before exp. */
export class ServiceTokenProvider {
  private readonly cache = new Map<string, { token: string; expiresAt: number }>();

  constructor(
    private readonly http: Pick<HttpClient, 'request'>,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly now: () => number = Date.now,
    private readonly skewMs = 10_000,
  ) {}

  async getToken(audience: string): Promise<string> {
    const hit = this.cache.get(audience);
    if (hit && hit.expiresAt > this.now()) return hit.token;
    const res = await this.http.request<{ access_token: string; expires_in: number }>({
      method: 'POST',
      path: '/oauth/token',
      body: {
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        audience,
      },
    });
    const { access_token, expires_in } = res.body;
    this.cache.set(audience, { token: access_token, expiresAt: this.now() + expires_in * 1000 - this.skewMs });
    return access_token;
  }
}

const unavailable = (err: unknown): DependencyUnavailableError =>
  new DependencyUnavailableError(err instanceof Error ? err.message : String(err));

export class HttpRoleClient implements RoleClient {
  constructor(
    private readonly http: Pick<HttpClient, 'request'>,
    private readonly tokens: Pick<ServiceTokenProvider, 'getToken'>,
  ) {}

  async getRole(roleId: string, budgetMs: number | undefined, correlationId?: string): Promise<RoleInfo> {
    try {
      const token = await this.tokens.getToken('role-service');
      const res = await this.http.request<RoleInfo>({
        method: 'GET',
        path: `/roles/${encodeURIComponent(roleId)}`,
        headers: { authorization: `Bearer ${token}` },
        budgetMs,
        correlationId,
      });
      return { id: res.body.id, name: res.body.name, version: res.body.version };
    } catch (err) {
      if (err instanceof HttpStatusError && err.status === 404) throw new RoleNotFoundError(roleId);
      throw unavailable(err);
    }
  }
}

export class HttpAuthClient implements AuthCredentialsClient {
  constructor(
    private readonly http: Pick<HttpClient, 'request'>,
    private readonly tokens: Pick<ServiceTokenProvider, 'getToken'>,
  ) {}

  async putCredentials(
    userId: string,
    body: { email: string; password: string; roleId: string; roleName: string; roleVersion: number },
    budgetMs: number | undefined,
    correlationId?: string,
  ): Promise<void> {
    try {
      const token = await this.tokens.getToken('auth-service');
      await this.http.request({
        method: 'PUT',
        path: `/internal/credentials/${encodeURIComponent(userId)}`,
        headers: { authorization: `Bearer ${token}` },
        body,
        budgetMs,
        correlationId,
      });
    } catch (err) {
      if (err instanceof HttpStatusError && err.status === 409) throw new CredentialsConflictError(userId);
      throw unavailable(err);
    }
  }

  async deleteCredentials(userId: string, correlationId?: string): Promise<void> {
    try {
      const token = await this.tokens.getToken('auth-service');
      await this.http.request({
        method: 'DELETE',
        path: `/internal/credentials/${encodeURIComponent(userId)}`,
        headers: { authorization: `Bearer ${token}` },
        correlationId,
      });
    } catch (err) {
      if (err instanceof HttpStatusError && err.status === 404) return;
      throw unavailable(err);
    }
  }
}
