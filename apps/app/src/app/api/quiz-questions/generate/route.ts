import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, SdsDocumentModel, QuizQuestionModel } from '@sds360/db';
import { z } from 'zod';
import { runQuizGeneration, JobError, MAX_QUIZ_QUESTIONS } from '@/lib/llm-jobs';

// Generation runs inside this request (no background worker)
export const maxDuration = 300;
const LLM_BUDGET_MS = (maxDuration - 30) * 1000;

const schema = z.object({
  sdsDocumentId: z.string().min(1),
  count: z.number().int().min(1).max(20).default(5),
});

export async function POST(req: Request) {
  const started = Date.now();
  const session = await auth();
  if (!session?.user?.customerId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json() as unknown;
    const { sdsDocumentId, count } = schema.parse(body);

    await connectDb();
    const doc = await SdsDocumentModel.findOne({
      _id: sdsDocumentId,
      customerId: session.user.customerId,
      reviewStatus: 'human_approved',
      status: 'active',
    });
    if (!doc) {
      return NextResponse.json(
        { success: false, error: 'SDS document not found or not yet approved.' },
        { status: 404 }
      );
    }

    const MAX_QUESTIONS = MAX_QUIZ_QUESTIONS;
    const existingCount = await QuizQuestionModel.countDocuments({
      customerId: session.user.customerId,
      sdsDocumentId,
      status: { $ne: 'rejected' },
    });
    if (existingCount >= MAX_QUESTIONS) {
      return NextResponse.json(
        { success: false, error: `Maximum of ${MAX_QUESTIONS} questions per document already reached.` },
        { status: 400 }
      );
    }

    const adjustedCount = Math.min(count, MAX_QUESTIONS - existingCount);

    const result = await runQuizGeneration(
      sdsDocumentId,
      session.user.customerId,
      adjustedCount,
      LLM_BUDGET_MS - (Date.now() - started),
    );
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof JobError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.errors[0].message }, { status: 400 });
    }
    console.error('[quiz-questions/generate]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
