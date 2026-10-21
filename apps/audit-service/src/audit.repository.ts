import type { Model } from 'mongoose';
import type { AuditDocument, AuditQuery, AuditRepository } from './audit.processor';

/** Append-only: exposes insert and query only. */
export class MongoAuditRepository implements AuditRepository {
  constructor(private readonly model: Model<AuditDocument>) {}

  async insert(doc: AuditDocument): Promise<'inserted' | 'duplicate'> {
    try {
      await this.model.create(doc);
      return 'inserted';
    } catch (err) {
      if ((err as { code?: number }).code === 11000) return 'duplicate';
      throw err;
    }
  }

  async query(q: AuditQuery): Promise<{ items: AuditDocument[]; total: number }> {
    const filter: Record<string, unknown> = {};
    if (q.type) filter.type = q.type;
    if (q.actor) filter.actorUserId = q.actor;
    if (q.from || q.to) {
      filter.occurredAt = { ...(q.from && { $gte: q.from }), ...(q.to && { $lte: q.to }) };
    }
    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ occurredAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean<AuditDocument[]>()
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }
}
