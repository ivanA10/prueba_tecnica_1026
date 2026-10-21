import { createPrivateKey, createPublicKey, createSign, KeyObject, randomUUID } from 'crypto';
import { hash, verify } from '@node-rs/argon2';
import type { Clock, PasswordHasher, SignedToken, TokenIssuer } from '../../application/ports';

/** argon2id (default algorithm of @node-rs/argon2), OWASP-recommended parameters. */
export class Argon2Hasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  }

  async verify(hashed: string, password: string): Promise<boolean> {
    try {
      return await verify(hashed, password);
    } catch {
      return false;
    }
  }
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export interface Jwks {
  keys: Array<{ kty: 'RSA'; n: string; e: string; alg: 'RS256'; use: 'sig'; kid: string }>;
}

const b64u = (v: string | Buffer) => Buffer.from(v).toString('base64url');

/** RS256 JWT signer built on node:crypto (jose v6 is ESM-only and breaks the Jest/CommonJS toolchain). */
export class JoseTokenIssuer implements TokenIssuer {
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  private readonly jwks: Jwks;

  constructor(
    pem: string,
    private readonly kid: string,
    private readonly issuer: string,
    private readonly clock: Clock = new SystemClock(),
  ) {
    this.privateKey = createPrivateKey(pem);
    this.publicKey = createPublicKey(this.privateKey);
    const jwk = this.publicKey.export({ format: 'jwk' });
    this.jwks = { keys: [{ kty: 'RSA', n: jwk.n as string, e: jwk.e as string, alg: 'RS256', use: 'sig', kid }] };
  }

  async sign(input: { sub: string; roles: string[]; audience: string; ttlSeconds: number }): Promise<SignedToken> {
    const iat = Math.floor(this.clock.now().getTime() / 1000);
    const exp = iat + input.ttlSeconds;
    const jti = randomUUID();
    const header = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: this.kid }));
    const claims = b64u(
      JSON.stringify({ sub: input.sub, roles: input.roles, jti, iss: this.issuer, aud: input.audience, iat, exp }),
    );
    const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(this.privateKey).toString('base64url');
    return { token: `${header}.${claims}.${signature}`, jti, iat, exp };
  }

  getJwks(): Jwks {
    return this.jwks;
  }

  /** In-process key resolver (D9): auth verifies its own tokens without HTTP. */
  keyResolver(): () => Promise<KeyObject> {
    return async () => this.publicKey;
  }
}
