import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, UserModel, AuditLogModel } from '@sds360/db';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

function generatePassword(): string {
  return crypto.randomBytes(9).toString('base64url').slice(0, 12);
}

// POST /api/users/[id]/reset-password — Access Manager resets an Admin's password
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.customerId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'access_manager') {
    return NextResponse.json({ success: false, error: 'Only Access Manager can reset admin passwords.' }, { status: 403 });
  }

  await connectDb();

  const target = await UserModel.findOne({
    _id: params.id,
    customerId: session.user.customerId,
    role: 'admin',
  });

  if (!target) {
    return NextResponse.json({ success: false, error: 'Admin user not found.' }, { status: 404 });
  }

  const newPassword = generatePassword();
  const passwordHash = await bcrypt.hash(newPassword, 10);

  await UserModel.findByIdAndUpdate(params.id, {
    passwordHash,
    forcePasswordChange: true,
  });

  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'noreply@sds360.com',
    to: target.email,
    subject: 'Your SDS 360 Password Has Been Reset',
    html: `
      <h2>Password Reset</h2>
      <p>Hi ${target.name},</p>
      <p>Your SDS 360 admin password has been reset by your Access Manager.</p>
      <p><strong>Temporary Password:</strong> ${newPassword}</p>
      <p>You will be required to set a new password on your next login.</p>
      <p><a href="${process.env.APP_URL ?? 'https://app.sds360.com'}/login">Login →</a></p>
    `,
  });

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

  return NextResponse.json({ success: true });
}
