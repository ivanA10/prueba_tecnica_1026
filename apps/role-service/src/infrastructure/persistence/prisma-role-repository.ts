import { Prisma, PrismaClient } from '../../generated/prisma';
import type { RoleData, RoleRepository } from '../../application/ports';
import { DuplicateRoleError, Role, VersionConflictError } from '../../domain/role';

const isUnique = (e: unknown): boolean => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

export class PrismaRoleRepository implements RoleRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(role: Role): Promise<Role> {
    try {
      return await this.db.role.create({ data: role });
    } catch (e) {
      if (isUnique(e)) throw new DuplicateRoleError(role.name);
      throw e;
    }
  }

  findById(id: string): Promise<Role | null> {
    return this.db.role.findUnique({ where: { id } });
  }

  list(): Promise<Role[]> {
    return this.db.role.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async update(id: string, data: RoleData, expectedVersion?: number): Promise<Role | null> {
    try {
      const res = await this.db.role.updateMany({
        where: { id, ...(expectedVersion !== undefined ? { version: expectedVersion } : {}) },
        data: { ...data, version: { increment: 1 } },
      });
      const current = await this.db.role.findUnique({ where: { id } });
      if (res.count === 0) {
        if (!current) return null;
        throw new VersionConflictError();
      }
      return current;
    } catch (e) {
      if (isUnique(e)) throw new DuplicateRoleError(data.name);
      throw e;
    }
  }
}
