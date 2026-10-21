import 'reflect-metadata';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import type { KeyLike } from 'jose';
import { JwtAuthGuard } from './guard';
import { DenylistReader, RedisDenylistReader, RedisLikeClient } from './denylist';

const ISS = 'auth-service';
const AUD = 'toka-api';
const KID = 'k1';

let privateKey: KeyLike;
let otherKey: KeyLike;
let keyResolver: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const kp = await generateKeyPair('RS256');
  privateKey = kp.privateKey;
  otherKey = (await generateKeyPair('RS256')).privateKey;
  const jwk = { ...(await exportJWK(kp.publicKey)), kid: KID, alg: 'RS256', use: 'sig' };
  keyResolver = createLocalJWKSet({ keys: [jwk] });
});

interface SignOpts {
  key?: KeyLike;
  kid?: string | null;
  aud?: string;
  iat?: number;
  exp?: number | string;
}

async function sign(o: SignOpts = {}): Promise<string> {
  const header: { alg: string; kid?: string } = { alg: 'RS256' };
  if (o.kid !== null) header.kid = o.kid ?? KID;
  return new SignJWT({ roles: ['admin'] })
    .setProtectedHeader(header)
    .setSubject('user-1')
    .setJti('jti-1')
    .setIssuer(ISS)
    .setAudience(o.aud ?? AUD)
    .setIssuedAt(o.iat)
    .setExpirationTime(o.exp ?? '5m')
    .sign(o.key ?? privateKey);
}

const okReader: DenylistReader = {
  isJtiDenied: async () => false,
  getUserDenyEpoch: async () => null,
};

function build(denylist: DenylistReader = okReader, timeoutMs = 20) {
  const logger = { warn: jest.fn() };
  const metrics = { increment: jest.fn() };
  const guard = new JwtAuthGuard({
    issuer: ISS,
    audience: AUD,
    keyResolver,
    denylist,
    denylistTimeoutMs: timeoutMs,
    logger,
    metrics,
  });
  return { guard, logger, metrics };
}

function ctx(token?: string) {
  const req: { headers: Record<string, string>; user?: { sub: string } } = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
  const context = { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
  return { context, req };
}

function fakeRedis(store: Record<string, string>): RedisLikeClient {
  return {
    exists: async (k) => (k in store ? 1 : 0),
    get: async (k) => store[k] ?? null,
  };
}

describe('JwtAuthGuard', () => {
  it('permite un token valido y expone request.user', async () => {
    const { guard } = build();
    const { context, req } = ctx(await sign());
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.user?.sub).toBe('user-1');
  });

  it('sigue verificando con la clave cacheada si falla el refresco del JWKS', async () => {
    let fail = false;
    const flaky = ((h: never, t: never) => {
      if (fail) throw new Error('jwks fetch failed');
      return (keyResolver as unknown as (h: never, t: never) => unknown)(h, t);
    }) as unknown as typeof keyResolver;
    const logger = { warn: jest.fn() };
    const guard = new JwtAuthGuard({ issuer: ISS, audience: AUD, keyResolver: flaky, denylist: okReader, logger });
    await expect(guard.canActivate(ctx(await sign()).context)).resolves.toBe(true);
    fail = true;
    await expect(guard.canActivate(ctx(await sign()).context)).resolves.toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ event: 'jwks.refresh_failed' }), expect.any(String));
  });

  it('rechaza un aud incorrecto',async () => {
    const { guard } = build();
    const { context } = ctx(await sign({ aud: 'otro-servicio' }));
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza token sin kid, con otro algoritmo o sin Bearer', async () => {
    const { guard } = build();
    const noKid = ctx(await sign({ kid: null }));
    await expect(guard.canActivate(noKid.context)).rejects.toBeInstanceOf(UnauthorizedException);
    const hsToken = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', kid: KID })
      .setSubject('u')
      .setJti('j')
      .setIssuer(ISS)
      .setAudience(AUD)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('secret-secret-secret-secret-32b'));
    await expect(guard.canActivate(ctx(hsToken).context)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard.canActivate(ctx().context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza un jti presente en auth:deny:jti:*', async () => {
    const { guard } = build(new RedisDenylistReader(fakeRedis({ 'auth:deny:jti:jti-1': '1' })));
    await expect(guard.canActivate(ctx(await sign()).context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza iat < auth:deny:user:* y acepta iat posterior', async () => {
    const now = Math.floor(Date.now() / 1000);
    const reader = new RedisDenylistReader(fakeRedis({ 'auth:deny:user:user-1': String(now) }));
    const { guard } = build(reader);
    await expect(guard.canActivate(ctx(await sign({ iat: now - 60 })).context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(guard.canActivate(ctx(await sign({ iat: now + 1 })).context)).resolves.toBe(true);
  });

  it('fail-open si el denylist falla o expira, con warn y metrica; firma y exp se validan siempre', async () => {
    const hanging: DenylistReader = {
      isJtiDenied: () => new Promise(() => undefined),
      getUserDenyEpoch: async () => null,
    };
    const failing: DenylistReader = {
      isJtiDenied: async () => {
        throw new Error('ECONNREFUSED');
      },
      getUserDenyEpoch: async () => null,
    };
    const a = build(hanging);
    await expect(a.guard.canActivate(ctx(await sign()).context)).resolves.toBe(true);
    expect(a.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'denylist.unavailable' }),
      expect.any(String),
    );
    expect(a.metrics.increment).toHaveBeenCalledWith('jwt_guard_denylist_unavailable');

    const b = build(failing);
    await expect(b.guard.canActivate(ctx(await sign()).context)).resolves.toBe(true);
    await expect(b.guard.canActivate(ctx(await sign({ key: otherKey })).context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    const past = Math.floor(Date.now() / 1000) - 3600;
    await expect(
      b.guard.canActivate(ctx(await sign({ iat: past - 60, exp: past })).context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
