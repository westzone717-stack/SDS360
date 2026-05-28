import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, QuizQuestionModel, TrainingRecordModel, UserModel } from '@sds360/db';
import { z } from 'zod';

const PASS_THRESHOLD = 80; // %
const VALIDITY_MONTHS = 12;

const schema = z.object({
  answers: z.array(z.object({
    questionId: z.string(),
    selectedIndex: z.number().int().min(0).max(3),
  })),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.customerId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json() as unknown;
    const { answers } = schema.parse(body);

    await connectDb();

    const questionIds = answers.map((a) => a.questionId);
    const questions = await QuizQuestionModel.find({
      _id: { $in: questionIds },
      customerId: session.user.customerId,
    }).select('correctIndex').lean();

    const questionMap = new Map(questions.map((q) => [String(q._id), q.correctIndex]));

    let correct = 0;
    const graded = answers.map((a) => {
      const correctIdx = questionMap.get(a.questionId);
      const isCorrect = correctIdx === a.selectedIndex;
      if (isCorrect) correct++;
      return { questionId: a.questionId, selectedIndex: a.selectedIndex, correct: isCorrect };
    });

    const score = Math.round((correct / answers.length) * 100);
    const pass = score >= PASS_THRESHOLD;

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + VALIDITY_MONTHS);

    // Get last attempt count
    const lastRecord = await TrainingRecordModel.findOne({
      customerId: session.user.customerId,
      userId: session.user.id,
    }).sort({ completedAt: -1 });

    const record = await TrainingRecordModel.create({
      customerId: session.user.customerId,
      userId: session.user.id,
      score,
      pass,
      totalQuestions: answers.length,
      correctAnswers: correct,
      answers: graded,
      attemptCount: (lastRecord?.attemptCount ?? 0) + 1,
      completedAt: new Date(),
      expiresAt,
    });

    // Update user's training status
    await UserModel.findByIdAndUpdate(session.user.id, {
      'trainingStatus.required': !pass,
      'trainingStatus.reason': pass ? undefined : 'failed',
      'trainingStatus.expiresAt': pass ? expiresAt : undefined,
    });

    return NextResponse.json({
      success: true,
      data: {
        score,
        pass,
        correct,
        total: answers.length,
        expiresAt: pass ? expiresAt : undefined,
        answers: graded,
        recordId: record._id,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.errors[0].message }, { status: 400 });
    }
    console.error('[submit]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
