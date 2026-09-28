/**
 * SDS 360 — Create (or reset) a super_admin account
 *
 * Intended for production: does not load .env, so MONGODB_URI must be passed
 * explicitly. Creates no customer and no other users.
 *
 * Usage:
 *   MONGODB_URI='mongodb+srv://...' \
 *   SUPERADMIN_EMAIL='you@company.com' \
 *   SUPERADMIN_NAME='Your Name' \
 *   pnpm create-superadmin
 *
 * Optional: SUPERADMIN_PASSWORD (min 12 chars). If omitted, a random password
 * is generated and printed once.
 *
 * If the email already exists as a super_admin, its password is reset and the
 * account is re-activated. If it exists with any other role, the script aborts.
 */

import crypto from 'crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDb } from '../packages/db/src/client.js';
import { UserModel } from '../packages/db/src/models/user.js';

function fail(msg: string): never {
  console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
  process.exit(1);
}

async function main() {
  const uri = process.env.MONGODB_URI;
  const email = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.SUPERADMIN_NAME?.trim() || 'Super Admin';
  let password = process.env.SUPERADMIN_PASSWORD;

  if (!uri) fail('MONGODB_URI is required (this script does not read .env).');
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('SUPERADMIN_EMAIL is missing or invalid.');

  const generated = !password;
  if (!password) password = crypto.randomBytes(18).toString('base64url');
  if (password.length < 12) fail('SUPERADMIN_PASSWORD must be at least 12 characters.');

  await connectDb();
  const host = mongoose.connection.host;
  const dbName = mongoose.connection.name;
  console.log(`Connected: ${host}/${dbName}`);

  const existing = await UserModel.findOne({ email });
  if (existing && existing.role !== 'super_admin') {
    fail(`${email} already exists with role "${existing.role}". Refusing to change it.`);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await UserModel.findOneAndUpdate(
    { email },
    {
      $set: { status: 'active', passwordHash, forcePasswordChange: false, trainingStatus: { required: false } },
      $setOnInsert: { email, name, role: 'super_admin', visibleModules: [] },
    },
    { upsert: true, new: true }
  );

  console.log(`\x1b[32m✓ ${existing ? 'Password reset for' : 'Created'} super_admin ${email} (id: ${user._id})\x1b[0m`);
  if (generated) {
    console.log(`\n  Password (shown once, save it now): \x1b[1m${password}\x1b[0m\n`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('\x1b[31mFailed:\x1b[0m', err);
  process.exit(1);
});
