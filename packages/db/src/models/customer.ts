import mongoose, { Schema, Document } from 'mongoose';
import type { Customer } from '@sds360/types';

export interface CustomerDoc extends Omit<Customer, '_id'>, Document {}

const CustomerSchema = new Schema(
  {
    name: { type: String, required: true },
    domain: { type: String },
    plan: { type: String, enum: ['starter', 'professional', 'enterprise'], default: 'starter' },
    status: { type: String, enum: ['active', 'suspended', 'cancelled'], default: 'active' },
    contractExpiresAt: { type: Date, required: true },
    maxUsers: { type: Number, default: 50 },
    maxSdsDocuments: { type: Number, default: 500 },
  },
  { timestamps: true }
);

CustomerSchema.index({ status: 1 });

export const CustomerModel =
  mongoose.models.Customer || mongoose.model<CustomerDoc>('Customer', CustomerSchema);
