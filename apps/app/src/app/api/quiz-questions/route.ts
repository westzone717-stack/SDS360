import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, QuizQuestionModel } from '@sds360/db';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.customerId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const difficulty = searchParams.get('difficulty');
  const sdsDocumentId = searchParams.get('sdsDocumentId');

  await connectDb();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = { customerId: session.user.customerId };
  if (status) filter.status = status;
  if (difficulty) filter.difficulty = difficulty;
  if (sdsDocumentId) filter.sdsDocumentId = sdsDocumentId;

  const questions = await QuizQuestionModel.find(filter)
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  return NextResponse.json({ success: true, data: questions });
}
