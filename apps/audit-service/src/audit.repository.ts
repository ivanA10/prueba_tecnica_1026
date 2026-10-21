import type { Model } from 'mongoose';
import type { AuditDocument, AuditQuery, AuditRepository } from './audit.processor';

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Case-insensitive anchored-prefix match; null when the input is empty after trimming. */
const prefixRegex = (value?: string): { $regex: string; $options: string } | null => {
  const v = value?.trim();
  return v ? { $regex: '^' + escapeRegex(v), $options: 'i' } : null;
};

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
    const type = prefixRegex(q.type);
    const actor = prefixRegex(q.actor);
    if (type) filter.type = type;
    if (actor) {
      // System events have no actorUserId (actorIsSystem) and are rendered as "system".
      const matchesSystem = 'system'.startsWith(q.actor!.trim().toLowerCase());
      if (matchesSystem) filter.$or = [{ actorIsSystem: true }, { actorUserId: actor }];
      else filter.actorUserId = actor;
    }
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
