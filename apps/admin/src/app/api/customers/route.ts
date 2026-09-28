import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, CustomerModel, UserModel, AuditLogModel } from '@sds360/db';
import { z } from 'zod';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { normalizeDomain, isValidDomain, isPublicEmailDomain, emailDomain } from '@sds360/types';


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

function generatePassword(): string {
  return crypto.randomBytes(9).toString('base64url').slice(0, 12);
}

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
    const accountsToCreate: Array<{ email: string; name: string; role: 'access_manager' | 'admin' }> = [
      { email: data.accessManagerEmail, name: data.accessManagerName, role: 'access_manager' },
      ...data.adminEmails.filter(Boolean).map((email) => ({ email, name: email.split('@')[0], role: 'admin' as const })),
    ];

    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    for (const account of accountsToCreate) {
      const password = generatePassword();
      const passwordHash = await bcrypt.hash(password, 10);
      await UserModel.create({
        customerId,
        email: account.email,
        name: account.name,
        role: account.role,
        status: 'active',
        passwordHash,
        forcePasswordChange: true,
      });

      await resend.emails.send({
        from: process.env.EMAIL_FROM ?? 'noreply@sds360.com',
        to: account.email,
        subject: `Welcome to SDS 360 — Your ${account.role === 'access_manager' ? 'Access Manager' : 'Admin'} Account`,
        html: `
          <h2>Welcome to SDS 360</h2>
          <p>An account has been created for you at <strong>${data.name}</strong>.</p>
          <p><strong>Login URL:</strong> ${process.env.APP_URL ?? 'https://app.sds360.com'}/login</p>
          <p><strong>Email:</strong> ${account.email}</p>
          <p><strong>Temporary Password:</strong> ${password}</p>
          <p>You will be required to change your password on first login.</p>
        `,
      });
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

    return NextResponse.json({ success: true, data: { customerId: customer._id } });
  } catch (err) {
    console.error('[POST /api/customers]', err);
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
