import mongoose, { Schema, Document } from 'mongoose';
import type { TrainingRecord } from '@sds360/types';

export interface TrainingRecordDoc extends Omit<TrainingRecord, '_id'>, Document {}

const AnswerSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, ref: 'QuizQuestion', required: true },
    selectedIndex: { type: Number, required: true },
    correct: { type: Boolean, required: true },
  },
  { _id: false }
);

const TrainingRecordSchema = new Schema<TrainingRecordDoc>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    score: { type: Number, required: true },
    pass: { type: Boolean, required: true },
    totalQuestions: { type: Number, required: true },
    correctAnswers: { type: Number, required: true },
    answers: { type: [AnswerSchema], required: true },
    attemptCount: { type: Number, default: 1 },
    completedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

TrainingRecordSchema.index({ customerId: 1, userId: 1, completedAt: -1 });
TrainingRecordSchema.index({ customerId: 1, expiresAt: 1 });

export const TrainingRecordModel =
  mongoose.models.TrainingRecord ||
  mongoose.model<TrainingRecordDoc>('TrainingRecord', TrainingRecordSchema);
