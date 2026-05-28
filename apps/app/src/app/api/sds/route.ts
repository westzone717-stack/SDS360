import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, SdsDocumentModel, AuditLogModel } from '@sds360/db';
import { z } from 'zod';

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {
    customerId: session.user.customerId,
    status: 'active',
    reviewStatus: 'human_approved',
  };
  if (q) filter.$text = { $search: q };
  if (hazard) filter.hazardLevel = hazard;

  const docs = await SdsDocumentModel.find(filter)
    .select('productName casNumber hazardLevel version reviewStatus createdAt uploadedBy')
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  return NextResponse.json({ success: true, data: docs });
}

// POST /api/sds — trigger LLM extraction after S3 upload
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.customerId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { docId } = (await req.json()) as { docId: string };

    // Enqueue BullMQ job for LLM extraction
    const { Queue } = await import('bullmq');
    const { getRedis } = await import('@/lib/redis');
    const queue = new Queue('sds-extraction', { connection: getRedis() });
    await queue.add('extract', { docId, customerId: session.user.customerId });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/sds]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
