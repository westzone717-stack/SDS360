import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, DeadLetterModel } from '@sds360/db';

// Platform-level view: all unresolved items across all tenants
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  await connectDb();
  const items = await DeadLetterModel.find({ resolvedAt: { $exists: false } })
    .sort({ failedAt: -1 })
    .limit(200)
    .lean();

  return NextResponse.json({ success: true, data: items });
}
