import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, CustomerModel, AuditLogModel } from '@sds360/db';
import { z } from 'zod';
import { normalizeDomain, isValidDomain, isPublicEmailDomain } from '@sds360/types';

type CustomerSnap = {
  name: string;
  domain?: string;
  contractExpiresAt: Date;
  status: string;
  plan: string;
  maxUsers: number;
  maxSdsDocuments: number;
};

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  // '' or null clears the domain (disables self-registration)
  domain: z.preprocess(
    (v) => (v === null || (typeof v === 'string' && !v.trim()) ? null : typeof v === 'string' ? normalizeDomain(v) : v),
    z
      .string()
      .refine(isValidDomain, 'Invalid domain (expected e.g. acme.com)')
      .refine((d) => !isPublicEmailDomain(d), 'Public email domains (gmail.com, hotmail.com, …) cannot be a customer domain')
      .nullable()
      .optional()
  ),
  status: z.enum(['active', 'suspended', 'cancelled']).optional(),
  plan: z.enum(['starter', 'professional', 'enterprise']).optional(),
  maxUsers: z.number().int().min(1).optional(),
  maxSdsDocuments: z.number().int().min(1).optional(),
  // Set an exact expiry date (YYYY-MM-DD) …
  contractExpiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // … or extend the current one by N months
  contractMonths: z.number().int().min(1).max(60).optional(),
});

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  await connectDb();
  const customer = await CustomerModel.findById(params.id);
  if (!customer) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: customer.toObject() });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json() as unknown;
    const data = updateSchema.parse(body);

    await connectDb();
    const before = (await CustomerModel.findById(params.id)) as unknown as CustomerSnap | null;
    if (!before) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    if (data.domain && data.domain !== before.domain) {
      const clash = await CustomerModel.exists({ domain: data.domain, _id: { $ne: params.id } });
      if (clash) {
        return NextResponse.json(
          { success: false, error: `Another customer already uses the domain ${data.domain}` },
          { status: 409 }
        );
      }
    }

    const updates: Record<string, unknown> = {};
    const unset: Record<string, 1> = {};
    if (data.name) updates.name = data.name;
    if (data.domain) updates.domain = data.domain;
    else if (data.domain === null) unset.domain = 1;
    if (data.status) updates.status = data.status;
    if (data.plan) updates.plan = data.plan;
    if (data.maxUsers) updates.maxUsers = data.maxUsers;
    if (data.maxSdsDocuments) updates.maxSdsDocuments = data.maxSdsDocuments;
    if (data.contractExpiresAt) {
      updates.contractExpiresAt = new Date(`${data.contractExpiresAt}T23:59:59.999Z`);
    } else if (data.contractMonths) {
      const exp = new Date(before.contractExpiresAt);
      exp.setMonth(exp.getMonth() + data.contractMonths);
      updates.contractExpiresAt = exp;
    }

    const updated = await CustomerModel.findByIdAndUpdate(
      params.id,
      { $set: updates, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
      { new: true }
    );

    await AuditLogModel.create({
      actorId: session.user.id,
      actorRole: 'super_admin',
      actorIp: 'server',
      action: 'update',
      resource: 'customer',
      resourceId: params.id,
      before: {
        name: before.name,
        domain: before.domain,
        status: before.status,
        plan: before.plan,
        maxUsers: before.maxUsers,
        maxSdsDocuments: before.maxSdsDocuments,
        contractExpiresAt: before.contractExpiresAt,
      },
      after: { ...updates, ...(unset.domain ? { domain: null } : {}) },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.errors[0].message }, { status: 400 });
    }
    console.error('[PATCH /api/customers/[id]]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
