import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, QuizQuestionModel } from '@sds360/db';

const DIFFICULTY_WEIGHTS = { basic: 3, advanced: 2, expert: 1 };
const QUIZ_SIZE = 20;

export async function GET() {
  const session = await auth();
  if (!session?.user?.customerId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'user') {
    return NextResponse.json({ success: false, error: 'Training is for users only' }, { status: 403 });
  }

  await connectDb();

  // Weighted random selection: more basic questions, fewer expert
  const questions = await QuizQuestionModel.find({
    customerId: session.user.customerId,
    status: 'approved',
  })
    .select('question options correctIndex difficulty relatedSection')
    .lean();

  if (questions.length === 0) {
    return NextResponse.json({ success: false, error: 'No approved questions available' }, { status: 404 });
  }

  // Build weighted pool
  const pool: typeof questions = [];
  for (const q of questions) {
    const w = DIFFICULTY_WEIGHTS[q.difficulty as keyof typeof DIFFICULTY_WEIGHTS] ?? 1;
    for (let i = 0; i < w; i++) pool.push(q);
  }

  // Fisher-Yates shuffle then take first QUIZ_SIZE
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const selected = pool.slice(0, Math.min(QUIZ_SIZE, questions.length));
  // Deduplicate by id
  const seen = new Set<string>();
  const deduped = selected.filter((q) => {
    const id = String(q._id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  // Strip correct answers from response
  const quizQuestions = deduped.map(({ correctIndex: _ci, ...q }) => q);

  return NextResponse.json({ success: true, data: quizQuestions });
}
