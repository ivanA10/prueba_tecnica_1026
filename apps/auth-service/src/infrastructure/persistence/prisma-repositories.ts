import { PrismaClient } from '../../generated/prisma';
import type {
  CredentialRepository,
  ProjectionRepository,
  RefreshTokenRepository,
} from '../../application/ports';
import type { CredentialRecord, CredentialStatus, RefreshTokenRecord } from '../../domain/errors';

export class PrismaCredentialRepository implements CredentialRepository {
  constructor(private readonly db: PrismaClient) {}

  findByEmail(email: string): Promise<CredentialRecord | null> {
    return this.db.credential.findUnique({ where: { email } });
  }

  findByUserId(userId: string): Promise<CredentialRecord | null> {
    return this.db.credential.findUnique({ where: { userId } });
  }

  async save(r: CredentialRecord): Promise<void> {
    await this.db.credential.upsert({
      where: { userId: r.userId },
      create: r,
      update: { email: r.email, passwordHash: r.passwordHash },
    });
  }

  async setStatus(userId: string, status: CredentialStatus): Promise<void> {
    await this.db.credential.updateMany({ where: { userId }, data: { status } });
  }

  async delete(userId: string): Promise<void> {
    await this.db.credential.deleteMany({ where: { userId } });
  }
}

export class PrismaProjectionRepository implements ProjectionRepository {
  constructor(private readonly db: PrismaClient) {}

  async getUserRole(userId: string) {
    const r = await this.db.userRoleProjection.findUnique({ where: { userId } });
    return r ? { roleId: r.roleId, lastVersion: r.userLastVersion } : null;
  }

  async saveUserRole(userId: string, roleId: string, lastVersion: number): Promise<void> {
    await this.db.userRoleProjection.upsert({
      where: { userId },
      create: { userId, roleId, userLastVersion: lastVersion },
      update: { roleId, userLastVersion: lastVersion },
    });
  }

  async setUserVersion(userId: string, lastVersion: number): Promise<void> {
    await this.db.userRoleProjection.updateMany({ where: { userId }, data: { userLastVersion: lastVersion } });
  }

  async getRoleName(roleId: string) {
    const r = await this.db.roleNameProjection.findUnique({ where: { roleId } });
    return r ? { name: r.roleName, lastVersion: r.lastVersion } : null;
  }

  async saveRoleName(roleId: string, name: string, lastVersion: number): Promise<void> {
    await this.db.roleNameProjection.upsert({
      where: { roleId },
      create: { roleId, roleName: name, lastVersion },
      update: { roleName: name, lastVersion },
    });
  }

  async deleteUser(userId: string): Promise<void> {
    await this.db.userRoleProjection.deleteMany({ where: { userId } });
  }

  async isProcessed(eventId: string): Promise<boolean> {
    return (await this.db.processedEvent.count({ where: { eventId } })) > 0;
  }

  async markProcessed(eventId: string): Promise<void> {
    await this.db.processedEvent.upsert({ where: { eventId }, create: { eventId }, update: {} });
  }
}

export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(r: Omit<RefreshTokenRecord, 'rotatedAt' | 'revokedAt'>): Promise<void> {
    await this.db.refreshToken.create({ data: r });
  }

  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return this.db.refreshToken.findUnique({ where: { tokenHash } });
  }

  async markRotated(id: string, at: Date): Promise<boolean> {
    const res = await this.db.refreshToken.updateMany({ where: { id, rotatedAt: null }, data: { rotatedAt: at } });
    return res.count === 1;
  }

  async revokeFamily(familyId: string, at: Date): Promise<void> {
    await this.db.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: at } });
  }

  async revokeAllForUser(userId: string, at: Date): Promise<void> {
    await this.db.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: at } });
  }
}
