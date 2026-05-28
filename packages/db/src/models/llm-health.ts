import mongoose, { Schema, Document } from 'mongoose';
import type { LlmHealthStats, DeadLetterQueueItem } from '@sds360/types';

export interface LlmHealthDoc extends Omit<LlmHealthStats, '_id'>, Document {}

const LlmHealthSchema = new Schema<LlmHealthDoc>(
  {
    provider: { type: String, enum: ['claude', 'gpt', 'ollama'], required: true, unique: true },
    state: { type: String, enum: ['closed', 'open', 'half_open'], default: 'closed' },
    failureCount: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    cooldownUntil: { type: Date },
    lastCheckedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const LlmHealthModel =
  mongoose.models.LlmHealth || mongoose.model<LlmHealthDoc>('LlmHealth', LlmHealthSchema);

// ─── Dead Letter Queue ────────────────────────────────────────────────────────

export interface DeadLetterDoc extends Omit<DeadLetterQueueItem, '_id'>, Document {}

const DeadLetterSchema = new Schema<DeadLetterDoc>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    taskType: { type: String, enum: ['sds_extraction', 'quiz_generation'], required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    failedAt: { type: Date, required: true },
    retryCount: { type: Number, default: 0 },
    lastError: { type: String, required: true },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

DeadLetterSchema.index({ resolvedAt: 1, retryCount: 1 });

export const DeadLetterModel =
  mongoose.models.DeadLetter || mongoose.model<DeadLetterDoc>('DeadLetter', DeadLetterSchema);
