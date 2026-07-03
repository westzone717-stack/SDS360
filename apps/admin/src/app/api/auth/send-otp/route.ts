import { NextResponse } from 'next/server';
import { connectDb, UserModel } from '@sds360/db';
import { storeOtp, checkRateLimit } from '@/lib/redis';
import { z } from 'zod';

const schema = z.object({ email: z.string().email() });
const IS_DEV = process.env.NODE_ENV !== 'production';

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

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

    let devOtp: string | undefined;

    if (user) {
      const otp = generateOtp();
      await storeOtp(email, otp);

      try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.EMAIL_FROM ?? 'noreply@sds360.com',
          to: email,
          subject: 'SDS 360 Admin Login Code',
          html: `<p>Your admin login code is:</p><h2 style="letter-spacing:4px">${otp}</h2><p>Expires in 10 minutes.</p>`,
        });
      } catch {
        console.warn(`[admin send-otp] Email not sent → OTP for ${email}: \x1b[33m${otp}\x1b[0m`);
        if (IS_DEV) devOtp = otp;
      }
    }

    return NextResponse.json({ success: true, ...(IS_DEV && devOtp ? { devOtp } : {}) });
  } catch (err) {
    console.error('[send-otp]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
