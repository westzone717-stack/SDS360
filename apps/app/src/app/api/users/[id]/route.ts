import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, UserModel, AuditLogModel } from '@sds360/db';
import { z } from 'zod';

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

  const isAdmin = session.user.role === 'admin';
  const isAccessManager = session.user.role === 'access_manager';

  // access_manager can only change status of admins; admin can change users
  if (!isAdmin && !isAccessManager) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json() as unknown;
    const updates = updateSchema.parse(body);

    await connectDb();
    const target = await UserModel.findOne({ _id: params.id, customerId: session.user.customerId });
    if (!target) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    // access_manager can only manage admins, not users
    if (isAccessManager && target.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Access Manager can only manage Admin accounts' }, { status: 403 });
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
