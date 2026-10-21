import { Injectable } from '@nestjs/common';
import { PrismaClient } from './generated/prisma';
import type { EventEnvelope } from '@toka/contracts';
import {
  EmailTakenError,
  EventBuilder,
  UserNotFoundError,
  UserPatch,
  UserRecord,
  UserRepository,
} from './ports';

const codeOf = (e: unknown): string | undefined => (e as { code?: string } | null)?.code;

type Row = {
  id: string;
  email: string;
  name: string;
  roleId: string;
  status: string;
  version: number;
  createdAt: Date;
};

const map = (r: Row): UserRecord => ({
  id: r.id,
  email: r.email,
  name: r.name,
  roleId: r.roleId,
  status: r.status as UserRecord['status'],
  version: r.version,
  createdAt: r.createdAt,
});

export function outboxData(env: EventEnvelope<unknown>, aggregateId: string) {
  return {
    eventId: env.eventId,
    type: env.type,
    aggregateId,
    aggregateVersion: env.aggregateVersion,
    envelope: env as unknown as object,
    occurredAt: new Date(env.occurredAt),
  };
}

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string) {
    const r = await this.prisma.user.findUnique({ where: { id } });
    return r ? map(r) : null;
  }

  async findByEmail(email: string) {
    const r = await this.prisma.user.findUnique({ where: { email } });
    return r ? map(r) : null;
  }

  async createPending(data: { id: string; email: string; name: string; roleId: string }) {
    try {
      return map(await this.prisma.user.create({ data: { ...data, status: 'PENDING' } }));
    } catch (e) {
      if (codeOf(e) === 'P2002') throw new EmailTakenError(data.email);
      throw e;
    }
  }

  async persistWithOutbox(id: string, patch: UserPatch, build: EventBuilder) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = map(await tx.user.update({ where: { id }, data: { ...patch, version: { increment: 1 } } }));
        await tx.outboxEvent.create({ data: outboxData(build(updated), id) });
        return updated;
      });
    } catch (e) {
      if (codeOf(e) === 'P2025') throw new UserNotFoundError(id);
      if (codeOf(e) === 'P2002') throw new EmailTakenError(id);
      throw e;
    }
  }

  async deleteWithOutbox(id: string, build: EventBuilder) {
    try {
      await this.prisma.$transaction(async (tx) => {
        const row = await tx.user.delete({ where: { id } });
        const user = map(row);
        await tx.outboxEvent.create({ data: outboxData(build({ ...user, version: user.version + 1 }), id) });
      });
    } catch (e) {
      if (codeOf(e) === 'P2025') throw new UserNotFoundError(id);
      throw e;
    }
  }

  async deletePending(id: string) {
    await this.prisma.user.deleteMany({ where: { id, status: 'PENDING' } });
  }

  async list(page: number, limit: number) {
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({ orderBy: { createdAt: 'asc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.user.count(),
    ]);
    return { items: rows.map(map), total };
  }

  async findStalePending(createdBefore: Date) {
    const rows = await this.prisma.user.findMany({
      where: { status: 'PENDING', createdAt: { lt: createdBefore } },
    });
    return rows.map(map);
  }
}
