import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, AnalysisRunModel } from '@sds360/db';

const ALLOWED_ROLES = new Set(['admin', 'user']);

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.customerId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!ALLOWED_ROLES.has(session.user.role)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  await connectDb();

  const run = await AnalysisRunModel.findOne({
    _id: params.id,
    customerId: session.user.customerId,
    userId: session.user.id,
  })
    .select('request report createdAt')
    .lean<{ request: string; report: string; createdAt: Date }>();

  if (!run) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

  const body = `# Analysis Report\n\n**Request:** ${run.request}\n**Generated:** ${new Date(run.createdAt).toLocaleString()}\n\n---\n\n${run.report}\n`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="analysis-${params.id}.md"`,
    },
  });
}
