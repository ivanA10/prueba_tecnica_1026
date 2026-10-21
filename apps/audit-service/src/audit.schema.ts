import { Schema } from 'mongoose';
import type { AuditDocument } from './audit.processor';

export const AuditEventSchema = new Schema<AuditDocument>(
  {
    eventId: { type: String, required: true, unique: true },
    type: { type: String, required: true },
    version: Number,
    aggregateVersion: Number,
    occurredAt: { type: Date, required: true },
    receivedAt: { type: Date, required: true },
    correlationId: String,
    actorUserId: String,
    actorRoles: [String],
    actorIsSystem: Boolean,
    routingKey: String,
    payload: Schema.Types.Mixed,
  },
  { collection: 'audit_events', versionKey: false },
);
AuditEventSchema.index({ occurredAt: -1 });
AuditEventSchema.index({ type: 1, occurredAt: -1 });
AuditEventSchema.index({ actorUserId: 1, occurredAt: -1 });
