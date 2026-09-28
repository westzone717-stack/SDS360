import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, CustomerModel, UserModel, AuditLogModel } from '@sds360/db';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { normalizeDomain, isValidDomain, isPublicEmailDomain, emailDomain } from '@sds360/types';
import { generateTempPassword, trySendEmail, appLoginUrl, type IssuedCredential } from '@/lib/credentials';


const email = z.string().trim().toLowerCase().pipe(z.string().email());

const createSchema = z
  .object({
    name: z.string().min(1),
    // Blank → undefined; otherwise normalized ("@Acme.com" → "acme.com")
    domain: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() ? normalizeDomain(v) : undefined),
      z
        .string()
        .refine(isValidDomain, 'Invalid domain (expected e.g. acme.com)')
        .refine((d) => !isPublicEmailDomain(d), 'Public email domains (gmail.com, hotmail.com, …) cannot be a customer domain')
        .optional()
    ),
    plan: z.enum(['starter', 'professional', 'enterprise']),
    contractMonths: z.number().int().min(1).max(60),
    maxUsers: z.number().int().min(1),
    accessManagerEmail: email,
    accessManagerName: z.string().min(1),
    // The form always sends at least one (possibly blank) admin field — drop blanks before validating
    adminEmails: z.preprocess(
      (v) => (Array.isArray(v) ? v.map((e) => String(e).trim()).filter(Boolean) : v),
      z.array(email).max(3)
    ),
  })
  .superRefine((data, ctx) => {
    if (!data.domain) return;
    const mismatched = [data.accessManagerEmail, ...data.adminEmails].filter((e) => emailDomain(e) !== data.domain);
    if (mismatched.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Email must end with @${data.domain}: ${mismatched.join(', ')}`,
      });
    }
  });

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  await connectDb();
  const customers = await CustomerModel.find().sort({ createdAt: -1 }).lean();
  return NextResponse.json({ success: true, data: customers });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json() as unknown;
    const data = createSchema.parse(body);

    await connectDb();

    // Self-registration routes users by domain, so it must identify exactly one customer
    if (data.domain && (await CustomerModel.exists({ domain: data.domain }))) {
      return NextResponse.json(
        { success: false, error: `Another customer already uses the domain ${data.domain}` },
        { status: 409 }
      );
    }

    const accountsToCreate: Array<{ email: string; name: string; role: 'access_manager' | 'admin' }> = [
      { email: data.accessManagerEmail, name: data.accessManagerName, role: 'access_manager' },
      ...data.adminEmails.map((email) => ({ email, name: email.split('@')[0], role: 'admin' as const })),
    ];
    // Check up front so a clash doesn't leave a customer with half its accounts
    const emails = accountsToCreate.map((a) => a.email);
    if (new Set(emails).size !== emails.length) {
      return NextResponse.json({ success: false, error: 'Each initial account needs a different email' }, { status: 400 });
    }
    const taken = await UserModel.find({ email: { $in: emails } }).select('email').lean<{ email: string }[]>();
    if (taken.length) {
      return NextResponse.json(
        { success: false, error: `Email already in use: ${taken.map((u) => u.email).join(', ')}` },
        { status: 409 }
      );
    }

    const contractExpiresAt = new Date();
    contractExpiresAt.setMonth(contractExpiresAt.getMonth() + data.contractMonths);

    const customer = await CustomerModel.create({
      name: data.name,
      domain: data.domain,
      plan: data.plan,
      status: 'active',
      contractExpiresAt,
      maxUsers: data.maxUsers,
    });

    const customerId = customer._id;
    const credentials: IssuedCredential[] = [];

    for (const account of accountsToCreate) {
      const tempPassword = generateTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      await UserModel.create({
        customerId,
        email: account.email,
        name: account.name,
        role: account.role,
        status: 'active',
        passwordHash,
        forcePasswordChange: true,
      });

      const emailed = await trySendEmail(
        account.email,
        `Welcome to SDS 360 — Your ${account.role === 'access_manager' ? 'Access Manager' : 'Admin'} Account`,
        `
          <h2>Welcome to SDS 360</h2>
          <p>An account has been created for you at <strong>${data.name}</strong>.</p>
          <p><strong>Login URL:</strong> ${appLoginUrl()}</p>
          <p><strong>Email:</strong> ${account.email}</p>
          <p><strong>Temporary Password:</strong> ${tempPassword}</p>
          <p>You will be required to change your password on first login.</p>
        `
      );
      credentials.push({ ...account, tempPassword, emailed });
    }

    await AuditLogModel.create({
      actorId: session.user.id,
      actorRole: 'super_admin',
      actorIp: 'server',
      action: 'create',
      resource: 'customer',
      resourceId: customer._id.toString(),
      after: { name: data.name, plan: data.plan },
    });

    // Temporary passwords are returned once so the super admin can hand them over
    return NextResponse.json({ success: true, data: { customerId: customer._id, credentials, loginUrl: appLoginUrl() } });
  } catch (err) {
    console.error('[POST /api/customers]', err);
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
