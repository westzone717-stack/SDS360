import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, UserModel, AuditLogModel } from '@sds360/db';
import bcrypt from 'bcryptjs';
import { generateTempPassword, trySendEmail, loginUrlFor } from '@/lib/credentials';

// Who may reset whose password (within the same customer). Access managers'
// own passwords are reset by the super admin in the admin portal.
const RESETTABLE: Record<string, string[]> = {
  access_manager: ['admin', 'user'],
  admin: ['user'],
};

// POST /api/users/[id]/reset-password — issue a temporary password, shown once to the caller
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.customerId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const allowedRoles = RESETTABLE[session.user.role];
  if (!allowedRoles) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }
  if (params.id === session.user.id) {
    return NextResponse.json({ success: false, error: 'Use Change Password for your own account.' }, { status: 400 });
  }

  try {
    await connectDb();
    const target = await UserModel.findOne({
      _id: params.id,
      customerId: session.user.customerId,
      role: { $in: allowedRoles },
      status: { $ne: 'pending' }, // pending requests get a password when approved
    });
    if (!target) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });

    const tempPassword = generateTempPassword();
    target.passwordHash = await bcrypt.hash(tempPassword, 10);
    target.forcePasswordChange = true;
    await target.save();

    const loginUrl = loginUrlFor(req);
    const emailed = await trySendEmail(
      target.email,
      'Your SDS 360 Password Has Been Reset',
      `
        <h2>Password Reset</h2>
        <p>Hi ${target.name},</p>
        <p>Your SDS 360 password has been reset by ${session.user.name ?? 'your administrator'}.</p>
        <p><strong>Temporary Password:</strong> ${tempPassword}</p>
        <p>You will be required to set a new password on your next login.</p>
        <p><a href="${loginUrl}">Login →</a></p>
      `
    );

    await AuditLogModel.create({
      customerId: session.user.customerId,
      actorId: session.user.id,
      actorRole: session.user.role,
      actorIp: req.headers.get('x-forwarded-for') ?? 'unknown',
      action: 'password_reset',
      resource: 'user',
      resourceId: params.id,
      after: { forcePasswordChange: true },
    });

    return NextResponse.json({
      success: true,
      data: { email: target.email, role: target.role, tempPassword, emailed, loginUrl },
    });
  } catch (err) {
    console.error('[POST /api/users/[id]/reset-password]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
