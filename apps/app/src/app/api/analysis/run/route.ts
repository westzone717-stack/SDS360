import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, AnalysisRunModel, AuditLogModel } from '@sds360/db';
import { runAnalysis } from '@/lib/analysis/agent';
import { z } from 'zod';

const ALLOWED_ROLES = new Set(['admin', 'user']);

const schema = z.object({
  request: z.string().min(1).max(2000),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.customerId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!ALLOWED_ROLES.has(session.user.role)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json() as unknown;
    const { request: userRequest } = schema.parse(body);

    await connectDb();

    let result;
    let status: 'completed' | 'failed' = 'completed';
    let errorMessage: string | undefined;

    try {
      result = await runAnalysis(session.user.customerId, userRequest);
    } catch (err) {
      status = 'failed';
      errorMessage = err instanceof Error ? err.message : String(err);
      result = { plan: { steps: [] }, stepResults: [], report: '', needsClarification: false };
    }

    const run = await AnalysisRunModel.create({
      customerId: session.user.customerId,
      userId: session.user.id,
      request: userRequest,
      plan: result.plan,
      stepResults: result.stepResults,
      report: result.report,
      status,
      needsClarification: result.needsClarification,
      candidates: result.candidates,
      error: errorMessage,
    });

    await AuditLogModel.create({
      customerId: session.user.customerId,
      actorId: session.user.id,
      actorRole: session.user.role,
      actorIp: req.headers.get('x-forwarded-for') ?? 'unknown',
      action: 'create',
      resource: 'analysis_run',
      resourceId: String(run._id),
      after: { status },
    });

    if (status === 'failed') {
      return NextResponse.json({ success: false, error: errorMessage, data: { id: run._id } }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: run._id,
        plan: result.plan,
        stepResults: result.stepResults,
        report: result.report,
        needsClarification: result.needsClarification,
        candidates: result.candidates,
        createdAt: run.createdAt,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.errors[0].message }, { status: 400 });
    }
    console.error('[analysis/run]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
