import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, UserModel, AuditLogModel } from '@sds360/db';
import { z } from 'zod';

export async function GET() {
  const session = await auth();
  if (!session?.user?.customerId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!['admin', 'access_manager'].includes(session.user.role)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  await connectDb();
  const users = await UserModel.find({ customerId: session.user.customerId })
    .select('-passwordHash')
    .sort({ role: 1, createdAt: -1 })
    .lean();

  return NextResponse.json({ success: true, data: users });
}

const approveSchema = z.object({ userId: z.string(), action: z.enum(['approve', 'reject']) });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.customerId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json() as unknown;
    const { userId, action } = approveSchema.parse(body);

    await connectDb();
    const user = await UserModel.findOneAndUpdate(
      { _id: userId, customerId: session.user.customerId, status: 'pending' },
      { status: action === 'approve' ? 'active' : 'suspended' },
      { new: true }
    );

    if (!user) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });

    await AuditLogModel.create({
      customerId: session.user.customerId,
      actorId: session.user.id,
      actorRole: session.user.role,
      actorIp: req.headers.get('x-forwarded-for') ?? 'unknown',
      action: action === 'approve' ? 'activate' : 'suspend',
      resource: 'user',
      resourceId: userId,
      after: { status: user.status },
    });

    return NextResponse.json({ success: true, data: { status: user.status } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
