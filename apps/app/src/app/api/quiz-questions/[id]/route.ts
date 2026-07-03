import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, QuizQuestionModel, AuditLogModel } from '@sds360/db';
import { z } from 'zod';

const patchSchema = z.object({
  action: z.enum(['approve', 'reject']),
  updates: z.object({
    question: z.string().optional(),
    options: z.array(z.string()).length(4).optional(),
    correctIndex: z.number().int().min(0).max(3).optional(),
    explanation: z.string().optional(),
  }).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.customerId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json() as unknown;
    const { action, updates } = patchSchema.parse(body);

    await connectDb();

    const question = await QuizQuestionModel.findOne({
      _id: params.id,
      customerId: session.user.customerId,
    });
    if (!question) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    // force_review questions cannot be bulk-approved; individual review only
    if (action === 'approve' && question.status === 'force_review') {
      // Still allow approval but require explicit individual action (already individual here)
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const updatePayload: Record<string, unknown> = { status: newStatus };
    if (updates?.question) updatePayload.question = updates.question;
    if (updates?.options) updatePayload.options = updates.options;
    if (updates?.correctIndex !== undefined) updatePayload.correctIndex = updates.correctIndex;
    if (updates?.explanation) updatePayload.explanation = updates.explanation;

    const updated = await QuizQuestionModel.findByIdAndUpdate(params.id, updatePayload, { new: true }).lean();

    await AuditLogModel.create({
      customerId: session.user.customerId,
      actorId: session.user.id,
      actorRole: session.user.role,
      actorIp: req.headers.get('x-forwarded-for') ?? 'unknown',
      action: action === 'approve' ? 'activate' : 'update',
      resource: 'quiz_question',
      resourceId: params.id,
      after: { status: newStatus },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.errors[0].message }, { status: 400 });
    }
    console.error('[quiz-questions/[id]]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
