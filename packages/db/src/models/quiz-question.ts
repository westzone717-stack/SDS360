import mongoose, { Schema, Document } from 'mongoose';
import type { QuizQuestion } from '@sds360/types';

export interface QuizQuestionDoc extends Omit<QuizQuestion, '_id'>, Document {}

const QuizQuestionSchema = new Schema<QuizQuestionDoc>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    sdsDocumentId: { type: Schema.Types.ObjectId, ref: 'SdsDocument', required: true },
    question: { type: String, required: true },
    options: { type: [String], required: true, validate: (v: string[]) => v.length === 4 },
    correctIndex: { type: Number, required: true, min: 0, max: 3 },
    explanation: { type: String, required: true },
    difficulty: { type: String, enum: ['basic', 'advanced', 'expert'], required: true },
    relatedSection: { type: String, required: true },
    modelUsed: { type: String, enum: ['claude', 'gpt', 'ollama'], required: true },
    status: {
      type: String,
      enum: ['ai_generated', 'under_review', 'force_review', 'approved', 'rejected'],
      default: 'ai_generated',
    },
    qualityLabel: { type: String },
  },
  { timestamps: true }
);

QuizQuestionSchema.index({ customerId: 1, sdsDocumentId: 1, status: 1 });
QuizQuestionSchema.index({ customerId: 1, difficulty: 1, status: 1 });

export const QuizQuestionModel =
  mongoose.models.QuizQuestion ||
  mongoose.model<QuizQuestionDoc>('QuizQuestion', QuizQuestionSchema);
