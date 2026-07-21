import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, AnalysisRunModel } from '@sds360/db';

const ALLOWED_ROLES = new Set(['admin', 'user']);

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.customerId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!ALLOWED_ROLES.has(session.user.role)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  await connectDb();

  const run = await AnalysisRunModel.findOne({
    _id: params.id,
    customerId: session.user.customerId,
    userId: session.user.id,
  }).lean();

  if (!run) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: run });
}
