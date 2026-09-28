import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, UserModel, AuditLogModel } from '@sds360/db';
import { z } from 'zod';
import { MANAGEABLE_ROLES, canManage } from '@/lib/user-permissions';

const updateSchema = z.object({
  status: z.enum(['active', 'suspended']).optional(),
  visibleModules: z.array(z.string()).optional(),
  department: z.string().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.customerId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!MANAGEABLE_ROLES[session.user.role]) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json() as unknown;
    const updates = updateSchema.parse(body);

    await connectDb();
    const target = await UserModel.findOne({ _id: params.id, customerId: session.user.customerId });
    if (!target) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    if (!canManage({ id: session.user.id, role: session.user.role }, { id: String(target._id), role: target.role })) {
      return NextResponse.json({ success: false, error: 'You cannot manage this account' }, { status: 403 });
    }
    // Pending requests go through approve/reject, which also issues the first password
    if (updates.status && target.status === 'pending') {
      return NextResponse.json({ success: false, error: 'Approve or reject this request instead' }, { status: 400 });
    }

    const before = { status: target.status, visibleModules: target.visibleModules };
    Object.assign(target, updates);
    await target.save();

    await AuditLogModel.create({
      customerId: session.user.customerId,
      actorId: session.user.id,
      actorRole: session.user.role,
      actorIp: req.headers.get('x-forwarded-for') ?? 'unknown',
      action: 'update',
      resource: 'user',
      resourceId: params.id,
      before,
      after: updates,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  await connectDb();
  await UserModel.findOneAndDelete({ _id: params.id, customerId: session.user.customerId, role: 'user' });

  await AuditLogModel.create({
    customerId: session.user.customerId,
    actorId: session.user.id,
    actorRole: session.user.role,
    actorIp: req.headers.get('x-forwarded-for') ?? 'unknown',
    action: 'delete',
    resource: 'user',
    resourceId: params.id,
  });

  return NextResponse.json({ success: true });
}
