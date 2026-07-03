import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, QuizQuestionModel, AuditLogModel } from '@sds360/db';
import { z } from 'zod';

const schema = z.object({ sdsDocumentId: z.string().min(1) });

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
    const { sdsDocumentId } = schema.parse(body);

    await connectDb();

    // force_review questions must be individually reviewed — only approve ai_generated + under_review
    const result = await QuizQuestionModel.updateMany(
      {
        customerId: session.user.customerId,
        sdsDocumentId,
        status: { $in: ['ai_generated', 'under_review'] },
      },
      { $set: { status: 'approved' } }
    );

    await AuditLogModel.create({
      customerId: session.user.customerId,
      actorId: session.user.id,
      actorRole: session.user.role,
      actorIp: req.headers.get('x-forwarded-for') ?? 'unknown',
      action: 'activate',
      resource: 'quiz_question',
      resourceId: sdsDocumentId,
      after: { bulkApproved: result.modifiedCount },
    });

    return NextResponse.json({ success: true, data: { approved: result.modifiedCount } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.errors[0].message }, { status: 400 });
    }
    console.error('[quiz-questions/bulk-approve]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
