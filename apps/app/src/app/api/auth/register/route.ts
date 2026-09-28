import { NextResponse } from 'next/server';
import { connectDb, CustomerModel, UserModel } from '@sds360/db';
import { emailDomain, isPublicEmailDomain } from '@sds360/types';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1),
  email: z.string().trim().toLowerCase().pipe(z.string().email()),
  department: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json() as unknown;
    const data = schema.parse(body);

    const domain = emailDomain(data.email);
    const noMatch = NextResponse.json(
      { success: false, error: 'No matching organization found for your email domain.' },
      { status: 404 }
    );
    // Public mailbox providers never identify an organization
    if (isPublicEmailDomain(domain)) return noMatch;

    await connectDb();

    const existingUser = await UserModel.findOne({ email: data.email });
    if (existingUser) {
      return NextResponse.json({ success: true });
    }

    const customer = await CustomerModel.findOne({ domain, status: 'active' });
    if (!customer) return noMatch;

    // Only admins can approve requests; fall back to access managers so someone is told
    let approvers = await UserModel.find({ customerId: customer._id, role: 'admin', status: 'active' }).select('email');
    if (!approvers.length) {
      approvers = await UserModel.find({ customerId: customer._id, role: 'access_manager', status: 'active' }).select('email');
    }

    await UserModel.create({
      customerId: customer._id,
      email: data.email,
      name: data.name,
      department: data.department,
      role: 'user',
      status: 'pending',
      forcePasswordChange: false,
      visibleModules: ['training'],
      trainingStatus: { required: true, reason: 'first_login' },
    });

    if (!approvers.length) {
      console.warn(`[register] no active admin/access_manager to notify for customer ${customer._id}`);
      return NextResponse.json({ success: true });
    }

    // Lazy-import Resend so the module is never evaluated at build time
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? 'noreply@sds360.com',
      to: approvers.map((u) => u.email),
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
