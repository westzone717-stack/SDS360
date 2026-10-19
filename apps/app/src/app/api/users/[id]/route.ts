import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, UserModel, CustomerModel, AuditLogModel } from '@sds360/db';
import { z } from 'zod';
import { canManage, canEditProfile, canEditEmail, canChangeRole, ASSIGNABLE_ROLES } from '@/lib/user-permissions';
import { emailDomain } from '@sds360/types';

const updateSchema = z.object({
  // Profile — see canEditProfile
  name: z.string().trim().min(1, 'Name is required').max(100).optional(),
  department: z.string().trim().max(100).optional(),
  email: z.string().trim().toLowerCase().pipe(z.string().email()).optional(),
  // Role — access managers only, admin <-> user
  role: z.enum(ASSIGNABLE_ROLES).optional(),
  // Account management — see canManage
  status: z.enum(['active', 'suspended']).optional(),
  visibleModules: z.array(z.string()).optional(),
});

const forbidden = (error: string) => NextResponse.json({ success: false, error }, { status: 403 });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.customerId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json() as unknown;
    const updates = updateSchema.parse(body);

    await connectDb();
    const target = await UserModel.findOne({ _id: params.id, customerId: session.user.customerId });
    if (!target) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    const actor = { id: session.user.id, role: session.user.role };
    const subject = { id: String(target._id), role: target.role };
    const isSelf = actor.id === subject.id;

    const touchesProfile = updates.name !== undefined || updates.department !== undefined || updates.email !== undefined;
    if (touchesProfile && !canEditProfile(actor, subject)) return forbidden('You cannot edit this account');
    if (updates.email !== undefined && !canEditEmail(actor, subject)) {
      return forbidden(isSelf ? 'Ask your administrator to change your email' : 'You cannot edit this account');
    }
    if (updates.role !== undefined && !canChangeRole(actor, subject)) return forbidden('You cannot change this role');
    if ((updates.status !== undefined || updates.visibleModules !== undefined) && !canManage(actor, subject)) {
      return forbidden('You cannot manage this account');
    }

    // Pending requests go through approve/reject, which also issues the first password
    if ((updates.status || updates.role) && target.status === 'pending') {
      return NextResponse.json({ success: false, error: 'Approve or reject this request instead' }, { status: 400 });
    }

    if (updates.email && updates.email !== target.email) {
      // Login looks users up by email alone, so it must be unique across all customers
      if (await UserModel.exists({ email: updates.email, _id: { $ne: target._id } })) {
        return NextResponse.json({ success: false, error: 'That email is already in use' }, { status: 409 });
      }
      const customer = await CustomerModel.findById(session.user.customerId).select('domain').lean<{ domain?: string }>();
      if (customer?.domain && emailDomain(updates.email) !== customer.domain) {
        return NextResponse.json(
          { success: false, error: `Email must end with @${customer.domain}` },
          { status: 400 }
        );
      }
    }

    const before = {
      name: target.name,
      department: target.department,
      email: target.email,
      role: target.role,
      status: target.status,
      visibleModules: target.visibleModules,
    };
    Object.assign(target, updates);
    // Admins aren't training-gated
    if (updates.role === 'admin') target.trainingStatus = { required: false };
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
    console.error('[PATCH /api/users/[id]]', err);
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
