import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, CustomerModel, AuditLogModel } from '@sds360/db';
import { z } from 'zod';

const updateSchema = z.object({
  status: z.enum(['active', 'suspended', 'cancelled']).optional(),
  plan: z.enum(['starter', 'professional', 'enterprise']).optional(),
  contractMonths: z.number().int().min(1).max(60).optional(),
});

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  await connectDb();
  const customer = await CustomerModel.findById(params.id).lean();
  if (!customer) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: customer });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json() as unknown;
    const data = updateSchema.parse(body);

    await connectDb();
    const before = await CustomerModel.findById(params.id).lean();
    if (!before) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    const updates: Record<string, unknown> = {};
    if (data.status) updates.status = data.status;
    if (data.plan) updates.plan = data.plan;
    if (data.contractMonths) {
      const exp = new Date(before.contractExpiresAt);
      exp.setMonth(exp.getMonth() + data.contractMonths);
      updates.contractExpiresAt = exp;
    }

    const updated = await CustomerModel.findByIdAndUpdate(params.id, updates, { new: true }).lean();

    await AuditLogModel.create({
      actorId: session.user.id,
      actorRole: 'super_admin',
      actorIp: 'server',
      action: 'update',
      resource: 'customer',
      resourceId: params.id,
      before: { status: before.status, plan: before.plan },
      after: updates,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
