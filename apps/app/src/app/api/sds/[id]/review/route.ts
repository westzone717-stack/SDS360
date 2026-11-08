import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, SdsDocumentModel, AuditLogModel } from '@sds360/db';
import { z } from 'zod';

const sectionSchema = z.object({
  value: z.string().optional(),
  values: z.array(z.string()).optional(),
  items: z.array(z.record(z.string())).optional(),
  confidence: z.number(),
  fieldStatus: z.enum(['pending', 'ai_approved', 'human_approved']),
});

const metadataSchema = z.object({
  productName: z.string().trim().min(1, 'Product name is required'),
  supplier: z.string(),
  entityBusinessName: z.string(),
  quantity: z.string(),
  reviewDate: z.string(),
  reviewBy: z.string(),
});

const reviewSchema = z.object({
  // sections.<sectionKey> = sectionSchema
  sections: z.record(sectionSchema),
  approved: z.boolean(),
  // Document details edited on the review page
  metadata: metadataSchema.optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.customerId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden — review requires Admin role' }, { status: 403 });
  }

  try {
    const body = await req.json() as unknown;
    const { sections, approved, metadata } = reviewSchema.parse(body);

    await connectDb();

    const update: Record<string, unknown> = {
      reviewedBy: session.user.id,
      reviewStatus: approved ? 'human_approved' : 'pending',
      isActive: approved,
      ...(metadata ?? {}),
    };

    let sectionCount = 0;
    for (const [sectionKey, section] of Object.entries(sections)) {
      const path = `sections.${sectionKey}`;
      if (section.value !== undefined) update[`${path}.value`] = section.value;
      if (section.values !== undefined) update[`${path}.values`] = section.values;
      if (section.items !== undefined) update[`${path}.items`] = section.items;
      update[`${path}.fieldStatus`] = section.fieldStatus;
      sectionCount++;
    }

    const doc = await SdsDocumentModel.findOneAndUpdate(
      { _id: params.id, customerId: session.user.customerId },
      update,
      { new: true }
    ) as { reviewStatus: string } | null;

    if (!doc) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    await AuditLogModel.create({
      customerId: session.user.customerId,
      actorId: session.user.id,
      actorRole: session.user.role,
      actorIp: req.headers.get('x-forwarded-for') ?? 'unknown',
      action: approved ? 'activate' : 'update',
      resource: 'sds_document',
      resourceId: params.id,
      after: { reviewStatus: doc.reviewStatus, sectionCount },
    });

    return NextResponse.json({ success: true, data: doc });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.errors[0].message }, { status: 400 });
    }
    console.error('[review]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
