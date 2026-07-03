/**
 * SDS 360 — Dev Seed Script
 *
 * Creates test fixtures for local development:
 *   - 1 customer  : Test Corp
 *   - 1 super_admin (admin portal :3001)
 *   - 1 access_manager + 1 admin + 1 user  (app portal :3000)
 *
 * All accounts use OTP: 888888  (written directly into Redis, TTL 24 h)
 * Run: pnpm seed
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

import mongoose from 'mongoose';
import Redis from 'ioredis';
import bcrypt from 'bcryptjs';
import { connectDb } from '../packages/db/src/client.js';
import { CustomerModel } from '../packages/db/src/models/customer.js';
import { UserModel } from '../packages/db/src/models/user.js';

// ── Config ────────────────────────────────────────────────────────────────────

const TEST_OTP = '888888';
const OTP_TTL = 86_400; // 24 hours

const CUSTOMER = {
  name: 'Test Corp',
  domain: 'testcorp.com',
  plan: 'professional' as const,
  status: 'active' as const,
  maxUsers: 100,
  maxSdsDocuments: 500,
};

const ACCOUNTS = [
  // Super Admin — logs into localhost:3001
  {
    email: 'superadmin@sds360.com',
    name: 'Super Admin',
    role: 'super_admin' as const,
    platform: true,           // not tied to a customer
    otpKey: (e: string) => `otp:${e}`,  // admin app key pattern
  },
  // Access Manager — logs into localhost:3000
  {
    email: 'manager@testcorp.com',
    name: 'Access Manager',
    role: 'access_manager' as const,
    platform: false,
    otpKey: (e: string) => `otp:app:${e}`,
  },
  // Admin — logs into localhost:3000
  {
    email: 'admin@testcorp.com',
    name: 'Test Admin',
    role: 'admin' as const,
    platform: false,
    otpKey: (e: string) => `otp:app:${e}`,
  },
  // Regular User — logs into localhost:3000
  {
    email: 'user@testcorp.com',
    name: 'Test User',
    role: 'user' as const,
    platform: false,
    otpKey: (e: string) => `otp:app:${e}`,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

const ok   = (msg: string) => console.log(`${GREEN}  ✓${RESET}  ${msg}`);
const info = (msg: string) => console.log(`${CYAN}  →${RESET}  ${msg}`);
const head = (msg: string) => console.log(`\n${BOLD}${YELLOW}▶ ${msg}${RESET}`);

// ── Main ──────────────────────────────────────────────────────────────────────

async function seed() {
  console.log(`\n${BOLD}SDS 360 — Seed${RESET}\n`);

  // MongoDB
  head('Connecting to MongoDB');
  await connectDb();
  ok(`MongoDB: ${process.env.MONGODB_URI}`);

  // Redis
  head('Connecting to Redis');
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 3,
  });
  await redis.ping();
  ok(`Redis: ${process.env.REDIS_URL ?? 'redis://localhost:6379'}`);

  // ── Customer ───────────────────────────────────────────────────────────────
  head('Customer');

  const contractExpiresAt = new Date();
  contractExpiresAt.setFullYear(contractExpiresAt.getFullYear() + 1);

  const customer = await CustomerModel.findOneAndUpdate(
    { domain: CUSTOMER.domain },
    {
      $setOnInsert: {
        ...CUSTOMER,
        contractExpiresAt,
      },
    },
    { upsert: true, new: true }
  );
  ok(`Customer: "${customer.name}"  (id: ${customer._id})`);

  // ── Users ──────────────────────────────────────────────────────────────────
  head('Users');

  const passwordHash = await bcrypt.hash('Test1234', 10);

  for (const acct of ACCOUNTS) {
    const customerId = acct.platform ? undefined : customer._id;

    // Fields applied on every run (idempotent)
    const always: Record<string, unknown> = {
      status: 'active',
      forcePasswordChange: false,
      passwordHash,
      // Ensure training gate is correct regardless of schema defaults
      trainingStatus: acct.role === 'user'
        ? { required: true, reason: 'first_login' }
        : { required: false },
    };

    // Fields applied only on first insert
    const onInsert: Record<string, unknown> = {
      email: acct.email,
      name: acct.name,
      role: acct.role,
      visibleModules: acct.role === 'user' ? ['training'] : [],
    };
    if (customerId) onInsert.customerId = customerId;
    // trainingStatus is handled in $set (always block) — do not duplicate here

    const user = await UserModel.findOneAndUpdate(
      { email: acct.email },
      { $set: always, $setOnInsert: onInsert },
      { upsert: true, new: true }
    );

    // Write OTP to Redis with 24-hour TTL
    const otpKey = acct.otpKey(acct.email);
    await redis.setex(otpKey, OTP_TTL, TEST_OTP);

    ok(`[${String(acct.role).padEnd(14)}]  ${acct.email}  (id: ${user._id})`);
    info(`OTP key: ${otpKey} = ${TEST_OTP}  (TTL: 24 h)`);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`
${BOLD}┌─────────────────────────────────────────────────────────────────┐
│  Test Accounts Ready                                            │
├──────────────────┬──────────────────────────────┬──────────────┤
│  Role            │  Email                       │  Login URL   │
├──────────────────┼──────────────────────────────┼──────────────┤
│  super_admin     │  superadmin@sds360.com       │  :3001       │
│  access_manager  │  manager@testcorp.com        │  :3000       │
│  admin           │  admin@testcorp.com          │  :3000       │
│  user            │  user@testcorp.com           │  :3000       │
├──────────────────┴──────────────────────────────┴──────────────┤
│  OTP (all accounts): ${YELLOW}888888${RESET}${BOLD}  (valid 24 h, re-run seed to reset) │
│  Password (fallback): Test1234                                  │
└─────────────────────────────────────────────────────────────────┘${RESET}
`);

  await redis.quit();
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('\n\x1b[31mSeed failed:\x1b[0m', err);
  process.exit(1);
});
