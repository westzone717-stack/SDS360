import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, AnalysisRunModel } from '@sds360/db';

const ALLOWED_ROLES = new Set(['admin', 'user']);

// GET /api/analysis — the current user's own analysis chat history
export async function GET() {
  const session = await auth();
  if (!session?.user?.customerId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!ALLOWED_ROLES.has(session.user.role)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  await connectDb();

  const runs = await AnalysisRunModel.find({
    customerId: session.user.customerId,
    userId: session.user.id,
  })
    .select('request report status needsClarification candidates createdAt')
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return NextResponse.json({ success: true, data: runs });
}
