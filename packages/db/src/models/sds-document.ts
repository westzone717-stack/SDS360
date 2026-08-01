import mongoose, { Schema, Document, Types } from 'mongoose';
import type { SdsDocument } from '@sds360/types';
import { SDS_SCHEMA } from '@sds360/types';

export interface SdsDocumentDoc extends Omit<SdsDocument, '_id' | 'customerId' | 'uploadedBy' | 'reviewedBy'>, Document {
  customerId: Types.ObjectId | string;
  uploadedBy: Types.ObjectId | string;
  reviewedBy?: Types.ObjectId | string;
}

// A single Hazardous Ingredients row — fixed set of columns, no free-form
// extension (matches the source form exactly).
const SdsIngredientSchema = new Schema(
  {
    casNumber: { type: String, default: '' },
    component: { type: String, default: '' },
    concentration: { type: String, default: '' },
    acgihTlvTwa: { type: String, default: '' },
    acgihTlvStel: { type: String, default: '' },
    acgihTlvC: { type: String, default: '' },
    mbOelTwa: { type: String, default: '' },
    mbOelStel: { type: String, default: '' },
    mbOelC: { type: String, default: '' },
  },
  { _id: false }
);

// Every section (single_select / multi_select / ingredients) shares this
// shape — `value`/`values`/`items` are mutually exclusive depending on the
// section's `type` in SDS_SCHEMA, enforced at the application layer rather
// than in the schema, since Mongoose has no native discriminated-union field.
const SdsSectionSchema = new Schema(
  {
    value: { type: String },
    values: { type: [String], default: undefined },
    items: { type: [SdsIngredientSchema], default: undefined },
    confidence: { type: Number, default: 0, min: 0, max: 1 },
    fieldStatus: {
      type: String,
      enum: ['pending', 'ai_approved', 'human_approved'],
      default: 'pending',
    },
    sourceLocation: {
      page: { type: Number },
      excerpt: { type: String },
    },
  },
  { _id: false }
);

// Build the sections definition from the canonical SDS_SCHEMA — one
// SdsSectionSchema per section key (physicalState, hazardousIngredients, …).
const sectionsDefinition = SDS_SCHEMA.reduce(
  (acc, section) => ({ ...acc, [section.key]: { type: SdsSectionSchema, default: () => ({}) } }),
  {} as Record<string, unknown>
);

const SdsDocumentSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    productName: { type: String, required: true },
    supplier: { type: String },
    entityBusinessName: { type: String },
    quantity: { type: String },
    reviewDate: { type: String },
    reviewBy: { type: String },
    hazardLevel: {
      type: String,
      enum: ['extreme', 'high', 'medium', 'low'],
      default: 'medium',
    },
    s3Key: { type: String, required: true },
    s3Bucket: { type: String, required: true },
    version: { type: Number, default: 1 },
    isActive: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'deactivated', 'deleted'], default: 'active' },
    reviewStatus: {
      type: String,
      enum: ['pending', 'ai_approved', 'human_approved'],
      default: 'pending',
    },
    modelUsed: { type: String, enum: ['claude', 'gpt', 'ollama'] },
    sections: sectionsDefinition,
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    contentHash: { type: String },
  },
  { timestamps: true }
);

SdsDocumentSchema.index({ customerId: 1, status: 1, isActive: 1 });
SdsDocumentSchema.index({ customerId: 1, productName: 'text', supplier: 'text' });
SdsDocumentSchema.index({ customerId: 1, hazardLevel: 1 });
SdsDocumentSchema.index({ customerId: 1, createdAt: -1 });
// Only enforce hash-uniqueness among live documents — a soft-deleted
// document's hash must not block re-uploading the same file later.
SdsDocumentSchema.index(
  { customerId: 1, contentHash: 1 },
  { unique: true, partialFilterExpression: { status: 'active', contentHash: { $exists: true } } }
);

export const SdsDocumentModel =
  mongoose.models.SdsDocument ||
  mongoose.model<SdsDocumentDoc>('SdsDocument', SdsDocumentSchema);
