import mongoose, { Schema, Document, Types } from 'mongoose';
import type { AnalysisRun } from '@sds360/types';

export interface AnalysisRunDoc extends Omit<AnalysisRun, '_id' | 'customerId' | 'userId'>, Document {
  customerId: Types.ObjectId | string;
  userId: Types.ObjectId | string;
}

const AnalysisPlanStepSchema = new Schema(
  {
    id: { type: String, required: true },
    tool: { type: String },
    args: { type: Schema.Types.Mixed },
    action: { type: String },
  },
  { _id: false }
);

const AnalysisStepResultSchema = new Schema(
  {
    id: { type: String, required: true },
    tool: { type: String },
    data: { type: Schema.Types.Mixed },
    error: { type: String },
  },
  { _id: false }
);

const AnalysisRunSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    request: { type: String, required: true },
    plan: { steps: { type: [AnalysisPlanStepSchema], default: [] } },
    stepResults: { type: [AnalysisStepResultSchema], default: [] },
    report: { type: String, default: '' },
    status: { type: String, enum: ['completed', 'failed'], required: true },
    needsClarification: { type: Boolean, default: false },
    candidates: { type: [String], default: undefined },
    error: { type: String },
  },
  { timestamps: true }
);

AnalysisRunSchema.index({ customerId: 1, userId: 1, createdAt: -1 });

export const AnalysisRunModel =
  mongoose.models.AnalysisRun ||
  mongoose.model<AnalysisRunDoc>('AnalysisRun', AnalysisRunSchema);
