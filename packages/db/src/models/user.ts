import mongoose, { Schema, Document, Types } from 'mongoose';
import type { User } from '@sds360/types';

export interface UserDoc extends Omit<User, '_id' | 'customerId'>, Document {
  customerId: Types.ObjectId | string;
  passwordHash?: string;
}

const TrainingStatusSchema = new Schema(
  {
    required: { type: Boolean, default: true },
    reason: { type: String, enum: ['first_login', 'expired', 'failed', 'sds_updated'] },
    expiresAt: { type: Date },
  },
  { _id: false }
);

const UserSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    email: { type: String, required: true, lowercase: true },
    name: { type: String, required: true },
    department: { type: String },
    role: {
      type: String,
      enum: ['super_admin', 'access_manager', 'admin', 'user'],
      required: true,
    },
    status: { type: String, enum: ['pending', 'active', 'suspended'], default: 'pending' },
    passwordHash: { type: String },
    forcePasswordChange: { type: Boolean, default: true },
    visibleModules: { type: [String], default: ['training'] },
    trainingStatus: { type: TrainingStatusSchema, default: { required: true, reason: 'first_login' } },
  },
  { timestamps: true }
);

UserSchema.index({ customerId: 1, email: 1 }, { unique: true });
UserSchema.index({ customerId: 1, role: 1 });
UserSchema.index({ customerId: 1, status: 1 });

export const UserModel =
  mongoose.models.User || mongoose.model<UserDoc>('User', UserSchema);
