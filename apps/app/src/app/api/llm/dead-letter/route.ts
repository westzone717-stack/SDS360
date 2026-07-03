import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, DeadLetterModel } from '@sds360/db';

// GET /api/llm/dead-letter — Admin: list unresolved dead letter queue items across this tenant
export async function GET() {
  const session = await auth();
  if (!session?.user?.customerId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  await connectDb();

  const items = await DeadLetterModel.find({
    customerId: session.user.customerId,
    resolvedAt: { $exists: false },
  })
    .sort({ failedAt: -1 })
    .limit(100)
    .lean();

  return NextResponse.json({ success: true, data: items });
}
