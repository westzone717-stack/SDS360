import mongoose, { Schema, Document, Types } from 'mongoose';
import type { SdsDocument } from '@sds360/types';

export interface SdsDocumentDoc extends Omit<SdsDocument, '_id' | 'customerId' | 'uploadedBy' | 'reviewedBy'>, Document {
  customerId: Types.ObjectId | string;
  uploadedBy: Types.ObjectId | string;
  reviewedBy?: Types.ObjectId | string;
}

const SdsSectionSchema = new Schema(
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

const SECTION_KEYS = [
  'identification', 'hazardIdentification', 'composition', 'firstAidMeasures',
  'fireFightingMeasures', 'accidentalReleaseMeasures', 'handlingAndStorage',
  'exposureControls', 'physicalAndChemicalProperties', 'stabilityAndReactivity',
  'toxicologicalInformation', 'ecologicalInformation', 'disposalConsiderations',
  'transportInformation', 'regulatoryInformation', 'otherInformation',
];

const sectionsDefinition = SECTION_KEYS.reduce(
  (acc, key) => ({ ...acc, [key]: { type: SdsSectionSchema } }),
  {} as Record<string, unknown>
);

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
    sections: { type: sectionsDefinition },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

SdsDocumentSchema.index({ customerId: 1, status: 1, isActive: 1 });
SdsDocumentSchema.index({ customerId: 1, productName: 'text', casNumber: 'text' });
SdsDocumentSchema.index({ customerId: 1, hazardLevel: 1 });
SdsDocumentSchema.index({ customerId: 1, createdAt: -1 });

export const SdsDocumentModel =
  mongoose.models.SdsDocument ||
  mongoose.model<SdsDocumentDoc>('SdsDocument', SdsDocumentSchema);
