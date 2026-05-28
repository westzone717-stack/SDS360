import mongoose, { Schema, Document, Types } from 'mongoose';
import type { AuditLog } from '@sds360/types';

// actorId / customerId stored as ObjectId in DB, exposed as string in types
export interface AuditLogDoc extends Omit<AuditLog, '_id' | 'actorId' | 'customerId'>, Document {
  actorId: Types.ObjectId | string;
  customerId?: Types.ObjectId | string;
}

const AuditLogSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actorRole: { type: String, required: true },
    actorIp: { type: String, required: true },
    action: { type: String, required: true },
    resource: { type: String, required: true },
    resourceId: { type: String, required: true },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Append-only — disable update and delete at schema level
AuditLogSchema.pre('findOneAndUpdate', function () {
  throw new Error('AuditLog is append-only');
});
AuditLogSchema.pre('deleteOne', function () {
  throw new Error('AuditLog is append-only');
});

AuditLogSchema.index({ customerId: 1, createdAt: -1 });
AuditLogSchema.index({ actorId: 1, createdAt: -1 });
AuditLogSchema.index({ resource: 1, resourceId: 1 });

export const AuditLogModel =
  mongoose.models.AuditLog || mongoose.model<AuditLogDoc>('AuditLog', AuditLogSchema);
