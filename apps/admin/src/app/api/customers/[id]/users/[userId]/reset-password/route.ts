import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, UserModel, AuditLogModel } from '@sds360/db';
import bcrypt from 'bcryptjs';
import { generateTempPassword, trySendEmail, appLoginUrl } from '@/lib/credentials';

// POST /api/customers/[id]/users/[userId]/reset-password
// Super admin issues a new temporary password to a customer's access manager or admin.
export async function POST(_: Request, { params }: { params: { id: string; userId: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  try {
    await connectDb();
    const target = await UserModel.findOne({
      _id: params.userId,
      customerId: params.id,
      role: { $in: ['access_manager', 'admin'] },
    });
    if (!target) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });

    const tempPassword = generateTempPassword();
    target.passwordHash = await bcrypt.hash(tempPassword, 10);
    target.forcePasswordChange = true;
    await target.save();

    const emailed = await trySendEmail(
      target.email,
      'Your SDS 360 Password Has Been Reset',
      `
        <h2>Password Reset</h2>
        <p>Hi ${target.name},</p>
        <p>Your SDS 360 password has been reset by the platform administrator.</p>
        <p><strong>Temporary Password:</strong> ${tempPassword}</p>
        <p>You will be required to set a new password on your next login.</p>
        <p><a href="${appLoginUrl()}">Login →</a></p>
      `
    );

    await AuditLogModel.create({
      customerId: params.id,
      actorId: session.user.id,
      actorRole: 'super_admin',
      actorIp: 'server',
      action: 'password_reset',
      resource: 'user',
      resourceId: params.userId,
      after: { forcePasswordChange: true },
    });

    return NextResponse.json({
      success: true,
      data: { email: target.email, tempPassword, emailed, loginUrl: appLoginUrl() },
    });
  } catch (err) {
    console.error('[POST reset-password]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
