import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  Clock,
  CredentialRepository,
  PasswordHasher,
  ProjectionRepository,
  RefreshTokenRepository,
  TOKENS,
} from './ports';

export interface UpsertCredentialInput {
  email: string;
  password: string;
  roleId: string;
  roleName?: string;
  roleVersion?: number;
  rolePermissions?: string[];
}

@Injectable()
export class CredentialsService {
  constructor(
    @Inject(TOKENS.Credentials) private readonly credentials: CredentialRepository,
    @Inject(TOKENS.Projection) private readonly projection: ProjectionRepository,
    @Inject(TOKENS.RefreshTokens) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(TOKENS.Hasher) private readonly hasher: PasswordHasher,
    @Inject(TOKENS.Clock) private readonly clock: Clock,
  ) {}

  /** Idempotent by userId. Returns `created` true on first insert. */
  async upsert(userId: string, input: UpsertCredentialInput): Promise<{ created: boolean }> {
    const email = input.email.trim().toLowerCase();
    const byEmail = await this.credentials.findByEmail(email);
    if (byEmail && byEmail.userId !== userId) throw new ConflictException('email_taken');

    const existing = byEmail ?? (await this.credentials.findByUserId(userId));
    let passwordHash: string;
    if (existing && (await this.hasher.verify(existing.passwordHash, input.password))) {
      passwordHash = existing.passwordHash;
    } else {
      passwordHash = await this.hasher.hash(input.password);
    }
    await this.credentials.save({
      userId,
      email,
      passwordHash,
      status: existing?.status ?? 'PENDING',
    });

    const ur = await this.projection.getUserRole(userId);
    await this.projection.saveUserRole(userId, input.roleId, ur?.lastVersion ?? 0);
    if (input.roleName) {
      const rn = await this.projection.getRoleName(input.roleId);
      const version = input.roleVersion ?? 0;
      if (!rn || version >= rn.lastVersion) {
        await this.projection.saveRoleName(input.roleId, input.roleName, version, input.rolePermissions);
      }
    }
    return { created: !existing };
  }

  async remove(userId: string): Promise<void> {
    await this.refreshTokens.revokeAllForUser(userId, this.clock.now());
    await this.credentials.delete(userId);
    await this.projection.deleteUser(userId);
  }
}
