import { NextResponse } from 'next/server';
import { connectDb, UserModel } from '@sds360/db';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  department: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json() as unknown;
    const data = schema.parse(body);

    const domain = data.email.split('@')[1];
    await connectDb();

    const existingUser = await UserModel.findOne({ email: data.email.toLowerCase() });
    if (existingUser) {
      return NextResponse.json({ success: true });
    }

    const domainAdmin = await UserModel.findOne({
      email: { $regex: `@${domain}$` },
      role: 'admin',
      status: 'active',
    });

    if (!domainAdmin) {
      return NextResponse.json(
        { success: false, error: 'No matching organization found for your email domain.' },
        { status: 404 }
      );
    }

    await UserModel.create({
      customerId: domainAdmin.customerId,
      email: data.email.toLowerCase(),
      name: data.name,
      department: data.department,
      role: 'user',
      status: 'pending',
      forcePasswordChange: false,
      visibleModules: ['training'],
      trainingStatus: { required: true, reason: 'first_login' },
    });

    // Lazy-import Resend so the module is never evaluated at build time
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? 'noreply@sds360.com',
      to: domainAdmin.email,
      subject: 'New User Registration Request — SDS 360',
      html: `
        <h2>New Access Request</h2>
        <p><strong>${data.name}</strong> (${data.email}) has requested access.</p>
        <p>Department: ${data.department ?? 'Not specified'}</p>
        <p>Log in to approve or reject this request in User Management.</p>
        <a href="${process.env.APP_URL}/users">Review Request →</a>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.errors[0].message }, { status: 400 });
    }
    console.error('[register]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
