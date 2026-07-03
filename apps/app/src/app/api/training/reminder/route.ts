import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, UserModel, TrainingRecordModel } from '@sds360/db';

// POST /api/training/reminder — Admin: send reminder emails to users with expired/missing training
export async function POST() {
  const session = await auth();
  if (!session?.user?.customerId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  await connectDb();

  // Find users who need training
  const users = await UserModel.find({
    customerId: session.user.customerId,
    role: 'user',
    status: 'active',
    'trainingStatus.required': true,
  })
    .select('name email trainingStatus')
    .lean();

  if (users.length === 0) {
    return NextResponse.json({ success: true, data: { sent: 0 } });
  }

  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);

  let sent = 0;
  for (const user of users) {
    const reason = user.trainingStatus?.reason;
    const reasonText =
      reason === 'expired' ? 'Your training certification has expired.' :
      reason === 'failed' ? 'You did not pass the last training assessment.' :
      'You have a pending training requirement.';

    try {
      await resend.emails.send({
        from: process.env.EMAIL_FROM ?? 'noreply@sds360.com',
        to: user.email,
        subject: 'Action Required: Complete Your Hazardous Materials Training — SDS 360',
        html: `
          <h2>Training Reminder</h2>
          <p>Hi ${user.name},</p>
          <p>${reasonText}</p>
          <p>Please log in to complete your training assessment as soon as possible.</p>
          <p><a href="${process.env.APP_URL ?? 'https://app.sds360.com'}/training">Complete Training →</a></p>
        `,
      });
      sent++;
    } catch (err) {
      console.error(`[reminder] Failed to send to ${user.email}:`, err);
    }
  }

  return NextResponse.json({ success: true, data: { sent, total: users.length } });
}
