import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, UserModel, AuditLogModel } from '@sds360/db';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { generateTempPassword, trySendEmail, loginUrlFor } from '@/lib/credentials';

export async function GET() {
  const session = await auth();
  if (!session?.user?.customerId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!['admin', 'access_manager'].includes(session.user.role)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  await connectDb();
  const users = await UserModel.find({ customerId: session.user.customerId })
    .select('-passwordHash')
    .sort({ role: 1, createdAt: -1 })
    .lean();

  return NextResponse.json({ success: true, data: users });
}

const approveSchema = z.object({ userId: z.string(), action: z.enum(['approve', 'reject']) });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.customerId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  // Both admins and access managers can approve/reject self-registration requests
  if (!['admin', 'access_manager'].includes(session.user.role)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json() as unknown;
    const { userId, action } = approveSchema.parse(body);

    await connectDb();

    // Self-registered users have no password yet, so approval issues a temporary one
    const tempPassword = action === 'approve' ? generateTempPassword() : undefined;
    const update = tempPassword
      ? { status: 'active', passwordHash: await bcrypt.hash(tempPassword, 10), forcePasswordChange: true }
      : { status: 'suspended' };

    const user = await UserModel.findOneAndUpdate(
      { _id: userId, customerId: session.user.customerId, role: 'user', status: 'pending' },
      update,
      { new: true }
    );

    if (!user) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });

    await AuditLogModel.create({
      customerId: session.user.customerId,
      actorId: session.user.id,
      actorRole: session.user.role,
      actorIp: req.headers.get('x-forwarded-for') ?? 'unknown',
      action: action === 'approve' ? 'activate' : 'suspend',
      resource: 'user',
      resourceId: userId,
      after: { status: user.status },
    });

    if (!tempPassword) {
      return NextResponse.json({ success: true, data: { status: user.status } });
    }

    const loginUrl = loginUrlFor(req);
    const emailed = await trySendEmail(
      user.email,
      'Your SDS 360 Access Has Been Approved',
      `
        <h2>Welcome to SDS 360</h2>
        <p>Hi ${user.name}, your access request has been approved.</p>
        <p><strong>Email:</strong> ${user.email}</p>
        <p><strong>Temporary Password:</strong> ${tempPassword}</p>
        <p>You will be required to set a new password on first login.</p>
        <p><a href="${loginUrl}">Login →</a></p>
      `
    );

    return NextResponse.json({
      success: true,
      data: { status: user.status, email: user.email, role: user.role, tempPassword, emailed, loginUrl },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
