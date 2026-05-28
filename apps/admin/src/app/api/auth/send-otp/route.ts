import { NextResponse } from 'next/server';
import { connectDb, UserModel } from '@sds360/db';
import { storeOtp, checkRateLimit } from '@/lib/redis';
import { z } from 'zod';


function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  try {
    const body = await req.json() as unknown;
    const { email } = schema.parse(body);

    const allowed = await checkRateLimit(email);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests. Try again in 5 minutes.' }, { status: 429 });
    }

    await connectDb();
    const user = await UserModel.findOne({ email, role: 'super_admin', status: 'active' });
    if (!user) {
      // Return success even if user not found to avoid email enumeration
      return NextResponse.json({ success: true });
    }

    const otp = generateOtp();
    await storeOtp(email, otp);

    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? 'noreply@sds360.com',
      to: email,
      subject: 'SDS 360 Admin Login Code',
      html: `<p>Your admin login code is:</p><h2 style="letter-spacing:4px">${otp}</h2><p>Expires in 10 minutes.</p>`,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[send-otp]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
