import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, SdsDocumentModel, AuditLogModel } from '@sds360/db';
import { z } from 'zod';
import { runSdsExtraction, JobError } from '@/lib/llm-jobs';

// Extraction runs inside this request (no background worker), so allow the
// longest duration Vercel permits; the LLM fallback chain gets most of it.
export const maxDuration = 300;
const LLM_BUDGET_MS = (maxDuration - 30) * 1000;

// GET /api/sds — list SDS for the authenticated user's tenant
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.customerId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  const hazard = searchParams.get('hazard');

  await connectDb();

  const reviewStatusParam = searchParams.get('reviewStatus');
  const isAdmin = session.user.role === 'admin';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {
    customerId: session.user.customerId,
    status: 'active',
  };

  if (isAdmin) {
    // Admin sees all review statuses by default; can narrow with ?reviewStatus=
    if (reviewStatusParam) filter.reviewStatus = reviewStatusParam;
    // else: no reviewStatus filter → admin sees pending + ai_approved + human_approved
  } else {
    filter.reviewStatus = 'human_approved';
  }

  if (q) filter.$text = { $search: q };
  if (hazard) filter.hazardLevel = hazard;

  const docs = await SdsDocumentModel.find(filter)
    .select('productName supplier hazardLevel version reviewStatus createdAt uploadedBy')
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  return NextResponse.json({ success: true, data: docs });
}

// POST /api/sds — run LLM extraction after S3 upload; responds when it is done
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
    const { docId } = (await req.json()) as { docId: string };
    const result = await runSdsExtraction(docId, session.user.customerId, LLM_BUDGET_MS - (Date.now() - started));
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof JobError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    console.error('[POST /api/sds]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
