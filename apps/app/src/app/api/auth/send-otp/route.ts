import { NextResponse } from 'next/server';
import { connectDb, UserModel, CustomerModel } from '@sds360/db';
import { storeOtp, checkRateLimit } from '@/lib/redis';
import { z } from 'zod';


const schema = z.object({ email: z.string().email() });

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as unknown;
    const { email } = schema.parse(body);

    const allowed = await checkRateLimit(email);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please wait 5 minutes.' },
        { status: 429 }
      );
    }

    await connectDb();
    const user = await UserModel.findOne({ email: email.toLowerCase(), status: 'active' });

    if (user) {
      // Check customer is active too
      const customer = await CustomerModel.findById(user.customerId);
      if (customer?.status === 'active') {
        const otp = generateOtp();
        await storeOtp(email, otp);
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.EMAIL_FROM ?? 'noreply@sds360.com',
          to: email,
          subject: 'SDS 360 Login Code',
          html: `<p>Your login code is: <strong style="font-size:24px;letter-spacing:4px;">${otp}</strong></p><p>Valid for 10 minutes.</p>`,
        });
      }
    }

    // Always return success to prevent email enumeration
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Invalid email' }, { status: 400 });
    }
    console.error('[app send-otp]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
