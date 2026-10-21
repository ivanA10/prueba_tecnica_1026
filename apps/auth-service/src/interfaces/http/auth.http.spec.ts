import { createPublicKey, createVerify } from 'crypto';
import { CanActivate, ExecutionContext, INestApplication, Injectable, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '@toka/jwt-guard';
import { CredentialsService } from '../../application/credentials-service';
import { TOKENS } from '../../application/ports';
import { AuthService, ServiceTokenService } from '../../application/token-service';
import { JoseTokenIssuer } from '../../infrastructure/crypto/crypto';
import {
  FakeCredentials,
  FakeDenylist,
  FakeHasher,
  FakeProjection,
  FakePublisher,
  FakeRefreshTokens,
  FixedClock,
  testConfig,
  testPrivateKeyPem,
} from '../../testing/fakes';
import {
  AuthController,
  HealthController,
  InternalCredentialsController,
  JwksController,
  OAuthController,
} from './controllers';
import { RolesGuard } from './roles.guard';

/** Test guard: authenticates from the `x-user` header (JSON `{sub,roles,jti,exp}`). */
@Injectable()
class HeaderGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const raw = req.headers['x-user'];
    if (!raw) return false;
    req.user = JSON.parse(raw as string);
    return true;
  }
}

function verifyRs256(token: string, set: { keys: Array<{ n: string; e: string; kid: string }> }) {
  const [h, p, sig] = token.split('.');
  const header = JSON.parse(Buffer.from(h, 'base64url').toString());
  const jwk = set.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('unknown kid');
  const key = createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' });
  const valid = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(key, Buffer.from(sig, 'base64url'));
  if (!valid) throw new Error('bad signature');
  return { header, payload: JSON.parse(Buffer.from(p, 'base64url').toString()) };
}

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ROLE_ID = '22222222-2222-4222-8222-222222222222';

describe('auth-service HTTP', () => {
  let app: INestApplication;
  let creds: FakeCredentials;
  let projection: FakeProjection;
  let tokens: FakeRefreshTokens;
  let deny: FakeDenylist;
  let publisher: FakePublisher;
  let issuer: JoseTokenIssuer;
  const clock = new FixedClock(new Date());
  const config = testConfig();
  const jwks = () => issuer.getJwks();
  const hasher = new FakeHasher();

  beforeEach(async () => {
    creds = new FakeCredentials();
    projection = new FakeProjection();
    tokens = new FakeRefreshTokens();
    deny = new FakeDenylist();
    publisher = new FakePublisher();
    issuer = new JoseTokenIssuer(testPrivateKeyPem(), config.jwtKid, config.jwtIssuer, clock);
    const mod = await Test.createTestingModule({
      controllers: [AuthController, OAuthController, JwksController, InternalCredentialsController, HealthController],
      providers: [
        { provide: TOKENS.Credentials, useValue: creds },
        { provide: TOKENS.Projection, useValue: projection },
        { provide: TOKENS.RefreshTokens, useValue: tokens },
        { provide: TOKENS.Denylist, useValue: deny },
        { provide: TOKENS.Hasher, useValue: hasher },
        { provide: TOKENS.Issuer, useValue: issuer },
        { provide: TOKENS.Publisher, useValue: publisher },
        { provide: TOKENS.Clock, useValue: clock },
        { provide: TOKENS.Config, useValue: config },
        AuthService,
        ServiceTokenService,
        CredentialsService,
        RolesGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(HeaderGuard)
      .compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await creds.save({ userId: USER_ID, email: 'a@b.com', passwordHash: 'h:pw123456', status: 'ACTIVE' });
    await projection.saveUserRole(USER_ID, ROLE_ID, 1);
    await projection.saveRoleName(ROLE_ID, 'admin', 1, ['users:read', 'roles:write']);
  });

  afterEach(() => app.close());

  it('login sets HttpOnly refresh cookie, returns a verifiable RS256 token and publishes login.succeeded', async () => {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email: 'A@b.com', password: 'pw123456' });
    expect(res.status).toBe(200);
    expect(res.body.expiresIn).toBe(900);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/refresh_token=.*HttpOnly.*SameSite=Strict/i);
    const { header, payload } = verifyRs256(res.body.accessToken, jwks());
    expect(header).toMatchObject({ alg: 'RS256', kid: 'test-kid' });
    expect(payload).toMatchObject({ sub: USER_ID, roles: ['admin'], permissions: ['users:read', 'roles:write'], iss: 'toka-auth', aud: 'toka-api' });
    expect(payload.jti).toBeDefined();
    expect(publisher.events.map((e) => e.type)).toEqual(['auth.login.succeeded']);
  });

  it('wrong password and PENDING user get the same 401 and publish login.failed', async () => {
    await creds.save({ userId: 'p', email: 'p@b.com', passwordHash: 'h:pw123456', status: 'PENDING' });
    const bad = await request(app.getHttpServer()).post('/auth/login').send({ email: 'a@b.com', password: 'nope' });
    const pending = await request(app.getHttpServer()).post('/auth/login').send({ email: 'p@b.com', password: 'pw123456' });
    const ghost = await request(app.getHttpServer()).post('/auth/login').send({ email: 'x@b.com', password: 'pw123456' });
    expect([bad.status, pending.status, ghost.status]).toEqual([401, 401, 401]);
    expect(bad.body).toEqual(pending.body);
    expect(publisher.events.filter((e) => e.type === 'auth.login.failed')).toHaveLength(3);
  });

  it('refresh rotates the token; reusing the rotated one revokes the family', async () => {
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email: 'a@b.com', password: 'pw123456' });
    const first = String(login.headers['set-cookie']).split(';')[0];
    const ok = await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', first);
    expect(ok.status).toBe(200);
    const second = String(ok.headers['set-cookie']).split(';')[0];
    expect(second).not.toEqual(first);
    expect(tokens.items[0].familyId).toBe(tokens.items[1].familyId);
    const reuse = await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', first);
    expect(reuse.status).toBe(401);
    const afterReuse = await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', second);
    expect(afterReuse.status).toBe(401);
    expect((await request(app.getHttpServer()).post('/auth/refresh')).status).toBe(401);
  });

  it('refresh fails once the user is no longer ACTIVE', async () => {
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email: 'a@b.com', password: 'pw123456' });
    await creds.setStatus(USER_ID, 'DISABLED');
    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', String(login.headers['set-cookie']).split(';')[0]);
    expect(res.status).toBe(401);
  });

  it('logout denylists the jti with the remaining TTL and revokes the refresh family', async () => {
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email: 'a@b.com', password: 'pw123456' });
    const exp = Math.floor(clock.now().getTime() / 1000) + 600;
    const res = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('x-user', JSON.stringify({ sub: USER_ID, roles: ['admin'], jti: 'jti-1', exp }))
      .set('Cookie', String(login.headers['set-cookie']).split(';')[0]);
    expect(res.status).toBe(204);
    expect(deny.jti.get('jti-1')).toBe(600);
    expect(tokens.items.every((t) => t.revokedAt)).toBe(true);
  });

  it('serves a public-only JWKS and issues client_credentials tokens with the requested audience', async () => {
    const jwksRes = await request(app.getHttpServer()).get('/.well-known/jwks.json');
    expect(jwksRes.body.keys[0]).toMatchObject({ kid: 'test-kid', alg: 'RS256', use: 'sig', kty: 'RSA' });
    expect(jwksRes.body.keys[0].d).toBeUndefined();

    const ok = await request(app.getHttpServer())
      .post('/oauth/token')
      .send({ grant_type: 'client_credentials', client_id: 'user-service', client_secret: 's3cret', audience: 'role-service' });
    expect(ok.status).toBe(200);
    const { payload } = verifyRs256(ok.body.access_token, jwks());
    expect(payload).toMatchObject({ aud: 'role-service', roles: ['service'], sub: 'user-service' });
    expect(payload.permissions).toBeUndefined();

    const bad = await request(app.getHttpServer())
      .post('/oauth/token')
      .send({ grant_type: 'client_credentials', client_id: 'user-service', client_secret: 'wrong', audience: 'role-service' });
    expect(bad.status).toBe(401);
    const grant = await request(app.getHttpServer())
      .post('/oauth/token')
      .send({ grant_type: 'password', client_id: 'user-service', client_secret: 's3cret', audience: 'x' });
    expect(grant.status).toBe(400);
  });

  it('internal credentials: 403 without service role; PUT is idempotent (201 then 200); 409 on foreign email; DELETE revokes', async () => {
    const svc = JSON.stringify({ sub: 'user-service', roles: ['service'], jti: 'j', exp: 9999999999 });
    const newId = '33333333-3333-4333-8333-333333333333';
    const body = { email: 'n@b.com', password: 'longpassword', roleId: ROLE_ID, roleName: 'admin', roleVersion: 1, rolePermissions: ['*'] };

    const forbidden = await request(app.getHttpServer())
      .put(`/internal/credentials/${newId}`)
      .set('x-user', JSON.stringify({ sub: 'u', roles: ['admin'], jti: 'j', exp: 1 }))
      .send(body);
    expect(forbidden.status).toBe(403);

    const created = await request(app.getHttpServer()).put(`/internal/credentials/${newId}`).set('x-user', svc).send(body);
    expect(created.status).toBe(201);
    expect(creds.items.get(newId)?.status).toBe('PENDING');
    expect(projection.roles.get(ROLE_ID)?.permissions).toEqual(['*']);
    const hashBefore = creds.items.get(newId)?.passwordHash;
    const again = await request(app.getHttpServer()).put(`/internal/credentials/${newId}`).set('x-user', svc).send(body);
    expect(again.status).toBe(200);
    expect(creds.items.get(newId)?.passwordHash).toBe(hashBefore);

    const conflict = await request(app.getHttpServer())
      .put(`/internal/credentials/${USER_ID}`)
      .set('x-user', svc)
      .send({ ...body, email: 'n@b.com' });
    expect(conflict.status).toBe(409);

    const del = await request(app.getHttpServer()).delete(`/internal/credentials/${newId}`).set('x-user', svc);
    expect(del.status).toBe(204);
    expect(creds.items.has(newId)).toBe(false);
    expect((await request(app.getHttpServer()).get('/health')).body).toEqual({ status: 'ok' });
  });
});
