import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, SdsDocumentModel, QuizQuestionModel } from '@sds360/db';
import { z } from 'zod';

const schema = z.object({
  sdsDocumentId: z.string().min(1),
  count: z.number().int().min(1).max(20).default(5),
});

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

    const MAX_QUESTIONS = 25;
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

    const { Queue } = await import('bullmq');
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    const queue = new Queue('quiz-generation', {
      connection: { host: new URL(redisUrl).hostname, port: Number(new URL(redisUrl).port) || 6379 },
    });
    await queue.add('generate', {
      sdsDocumentId,
      customerId: session.user.customerId,
      count: adjustedCount,
    });

    return NextResponse.json({ success: true, data: { queued: true } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.errors[0].message }, { status: 400 });
    }
    console.error('[quiz-questions/generate]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
