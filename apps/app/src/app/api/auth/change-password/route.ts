import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, UserModel, AuditLogModel } from '@sds360/db';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

const schema = z.object({
  password: z.string().min(8),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json() as unknown;
    const { password } = schema.parse(body);

    const passwordHash = await bcrypt.hash(password, 10);

    await connectDb();
    await UserModel.findByIdAndUpdate(session.user.id, {
      passwordHash,
      forcePasswordChange: false,
    });

    await AuditLogModel.create({
      customerId: session.user.customerId,
      actorId: session.user.id,
      actorRole: session.user.role,
      actorIp: req.headers.get('x-forwarded-for') ?? 'unknown',
      action: 'password_reset',
      resource: 'user',
      resourceId: session.user.id,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Password must be at least 8 characters.' }, { status: 400 });
    }
    console.error('[change-password]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
