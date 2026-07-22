import mongoose, { Schema, Document, Types } from 'mongoose';
import type { SdsDocument } from '@sds360/types';
import { SDS_SCHEMA } from '@sds360/types';

export interface SdsDocumentDoc extends Omit<SdsDocument, '_id' | 'customerId' | 'uploadedBy' | 'reviewedBy'>, Document {
  customerId: Types.ObjectId | string;
  uploadedBy: Types.ObjectId | string;
  reviewedBy?: Types.ObjectId | string;
}

// Level 3 — a single discrete field (e.g. "Product Name", "Flash Point")
const SdsFieldSchema = new Schema(
  {
    content: { type: String, default: '' },
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

// Build the nested sections definition from the canonical SDS_SCHEMA:
// sections.<sectionKey>.subsections.<subsectionKey>.fields.<fieldKey> = SdsFieldSchema
const sectionsDefinition = SDS_SCHEMA.reduce((sectionsAcc, section) => {
  const subsectionsDefinition = section.subsections.reduce((subAcc, sub) => {
    const fieldsDefinition = sub.fields.reduce(
      (fieldAcc, field) => ({ ...fieldAcc, [field.key]: { type: SdsFieldSchema, default: () => ({}) } }),
      {} as Record<string, unknown>
    );
    return { ...subAcc, [sub.key]: { fields: fieldsDefinition } };
  }, {} as Record<string, unknown>);
  return { ...sectionsAcc, [section.key]: { subsections: subsectionsDefinition } };
}, {} as Record<string, unknown>);

const SdsDocumentSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    productName: { type: String, required: true },
    casNumber: { type: String },
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
    // NOTE: assigned directly (not wrapped in `{ type: sectionsDefinition }`) —
    // Mongoose auto-detects plain nested objects without a `type` key as
    // subdocument paths; wrapping the whole thing in `type:` breaks the
    // recursive path expansion for deeply nested schemas like this one.
    sections: sectionsDefinition,
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    contentHash: { type: String },
  },
  { timestamps: true }
);

SdsDocumentSchema.index({ customerId: 1, status: 1, isActive: 1 });
SdsDocumentSchema.index({ customerId: 1, productName: 'text', casNumber: 'text' });
SdsDocumentSchema.index({ customerId: 1, hazardLevel: 1 });
SdsDocumentSchema.index({ customerId: 1, createdAt: -1 });
// Only enforce hash-uniqueness among live documents — a soft-deleted
// document's hash must not block re-uploading the same file later.
// (partialFilterExpression only supports equality/$exists/$gt.../$and, so
// this covers the 'active' status; 'deactivated' isn't wired up anywhere yet.)
SdsDocumentSchema.index(
  { customerId: 1, contentHash: 1 },
  { unique: true, partialFilterExpression: { status: 'active', contentHash: { $exists: true } } }
);

export const SdsDocumentModel =
  mongoose.models.SdsDocument ||
  mongoose.model<SdsDocumentDoc>('SdsDocument', SdsDocumentSchema);
