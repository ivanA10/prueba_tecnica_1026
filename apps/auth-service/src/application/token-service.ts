import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createEnvelope, RoutingKeys } from '@toka/contracts';
import { getCorrelationId } from '@toka/logger';
import type { AuthConfig } from '../config/config';
import type { CredentialRecord } from '../domain/errors';
import {
  Clock,
  CredentialRepository,
  DenylistWriter,
  EventPublisher,
  PasswordHasher,
  ProjectionRepository,
  RefreshTokenRepository,
  TOKENS,
  TokenIssuer,
} from './ports';

export const USER_AUDIENCE = 'toka-api';
export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export interface LoginResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshMaxAgeSeconds: number;
}

@Injectable()
export class AuthService {
  private dummyHash?: string;

  constructor(
    @Inject(TOKENS.Credentials) private readonly credentials: CredentialRepository,
    @Inject(TOKENS.Projection) private readonly projection: ProjectionRepository,
    @Inject(TOKENS.RefreshTokens) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(TOKENS.Denylist) private readonly denylist: DenylistWriter,
    @Inject(TOKENS.Hasher) private readonly hasher: PasswordHasher,
    @Inject(TOKENS.Issuer) private readonly issuer: TokenIssuer,
    @Inject(TOKENS.Publisher) private readonly publisher: EventPublisher,
    @Inject(TOKENS.Clock) private readonly clock: Clock,
    @Inject(TOKENS.Config) private readonly config: AuthConfig,
  ) {}

  private correlation(): string {
    return getCorrelationId() ?? randomUUID();
  }

  private async fail(email: string, reason: string, ip?: string): Promise<never> {
    await this.publisher.publish(
      createEnvelope({
        type: RoutingKeys.AuthLoginFailed,
        aggregateVersion: 0,
        correlationId: this.correlation(),
        actor: 'system',
        payload: { email, reason, ip },
      }),
    );
    throw new UnauthorizedException('invalid_credentials');
  }

  async login(emailRaw: string, password: string, ip?: string): Promise<LoginResult> {
    const email = emailRaw.trim().toLowerCase();
    const cred = await this.credentials.findByEmail(email);
    if (!cred) {
      this.dummyHash ??= await this.hasher.hash('toka-dummy-password');
      await this.hasher.verify(this.dummyHash, password);
      return this.fail(email, 'not_found', ip);
    }
    const ok = await this.hasher.verify(cred.passwordHash, password);
    if (!ok) return this.fail(email, 'bad_password', ip);
    if (cred.status !== 'ACTIVE') return this.fail(email, cred.status.toLowerCase(), ip);

    const result = await this.issueSession(cred, randomUUID());
    const roles = await this.resolveRoles(cred.userId);
    await this.publisher.publish(
      createEnvelope({
        type: RoutingKeys.AuthLoginSucceeded,
        aggregateVersion: 0,
        correlationId: this.correlation(),
        actor: { userId: cred.userId, roles },
        payload: { userId: cred.userId, email, ip },
      }),
    );
    return result;
  }

  private async resolveAccess(userId: string): Promise<{ roles: string[]; permissions: string[] }> {
    const ur = await this.projection.getUserRole(userId);
    const role = ur ? await this.projection.getRoleName(ur.roleId) : null;
    return role ? { roles: [role.name], permissions: role.permissions } : { roles: [], permissions: [] };
  }

  private async resolveRoles(userId: string): Promise<string[]> {
    return (await this.resolveAccess(userId)).roles;
  }

  private async issueSession(cred: CredentialRecord, familyId: string): Promise<LoginResult> {
    const { roles, permissions } = await this.resolveAccess(cred.userId);
    const signed = await this.issuer.sign({
      sub: cred.userId,
      roles,
      permissions,
      audience: USER_AUDIENCE,
      ttlSeconds: this.config.accessTokenTtl,
    });
    const refreshToken = randomBytes(32).toString('base64url');
    await this.refreshTokens.create({
      id: randomUUID(),
      tokenHash: sha256(refreshToken),
      userId: cred.userId,
      familyId,
      expiresAt: new Date(this.clock.now().getTime() + this.config.refreshTokenTtl * 1000),
    });
    return {
      accessToken: signed.token,
      expiresIn: this.config.accessTokenTtl,
      refreshToken,
      refreshMaxAgeSeconds: this.config.refreshTokenTtl,
    };
  }

  async refresh(rawToken: string | undefined): Promise<LoginResult> {
    if (!rawToken) throw new UnauthorizedException('invalid_refresh');
    const now = this.clock.now();
    const rec = await this.refreshTokens.findByHash(sha256(rawToken));
    if (!rec) throw new UnauthorizedException('invalid_refresh');
    if (rec.rotatedAt) {
      await this.refreshTokens.revokeFamily(rec.familyId, now);
      throw new UnauthorizedException('invalid_refresh');
    }
    if (rec.revokedAt || rec.expiresAt <= now) throw new UnauthorizedException('invalid_refresh');
    const cred = await this.credentials.findByUserId(rec.userId);
    if (!cred || cred.status !== 'ACTIVE') throw new UnauthorizedException('invalid_refresh');
    if (!(await this.refreshTokens.markRotated(rec.id, now))) {
      await this.refreshTokens.revokeFamily(rec.familyId, now);
      throw new UnauthorizedException('invalid_refresh');
    }
    return this.issueSession(cred, rec.familyId);
  }

  async logout(user: { sub: string; jti: string; exp: number }, rawRefresh?: string): Promise<void> {
    const now = this.clock.now();
    const ttl = Math.max(1, user.exp - Math.floor(now.getTime() / 1000));
    await this.denylist.denyJti(user.jti, ttl);
    const rec = rawRefresh ? await this.refreshTokens.findByHash(sha256(rawRefresh)) : null;
    if (rec && rec.userId === user.sub) await this.refreshTokens.revokeFamily(rec.familyId, now);
    else await this.refreshTokens.revokeAllForUser(user.sub, now);
  }

  async revokeUserSessions(userId: string): Promise<void> {
    const now = this.clock.now();
    await this.denylist.denyUser(userId, Math.floor(now.getTime() / 1000), this.config.accessTokenTtl);
    await this.refreshTokens.revokeAllForUser(userId, now);
  }
}

@Injectable()
export class ServiceTokenService {
  constructor(
    @Inject(TOKENS.Issuer) private readonly issuer: TokenIssuer,
    @Inject(TOKENS.Config) private readonly config: AuthConfig,
  ) {}

  async issue(clientId: string, clientSecret: string, audience: string) {
    const client = this.config.serviceClients.find((c) => c.id === clientId);
    const expected = createHash('sha256')
      .update(client?.secret ?? 'no-client')
      .digest();
    const given = createHash('sha256').update(clientSecret).digest();
    if (!client || !timingSafeEqual(expected, given)) throw new UnauthorizedException('invalid_client');
    const signed = await this.issuer.sign({
      sub: clientId,
      roles: ['service'],
      audience,
      ttlSeconds: this.config.serviceTokenTtl,
    });
    return { access_token: signed.token, token_type: 'Bearer', expires_in: this.config.serviceTokenTtl };
  }
}
