import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, SdsDocumentModel, AuditLogModel } from '@sds360/db';
import { getPresignedDownloadUrl } from '@/lib/s3';
import { z } from 'zod';
import mongoose from 'mongoose';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.customerId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  await connectDb();

  // .lean() returns plain JS object — required so React can spread it safely
  const doc = await SdsDocumentModel.findOne({
    _id: params.id,
    customerId: new mongoose.Types.ObjectId(session.user.customerId),
    status: { $ne: 'deleted' },
  }).lean();

  if (!doc) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

  // Attach download URL if client asks
  const { searchParams } = new URL(req.url);
  if (searchParams.get('download') === '1') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const downloadUrl = await getPresignedDownloadUrl((doc as any).s3Key);
    return NextResponse.json({ success: true, data: { ...doc, downloadUrl } });
  }

  return NextResponse.json({ success: true, data: doc });
}

const updateSchema = z.object({
  status: z.enum(['active', 'deactivated', 'deleted']).optional(),
  productName: z.string().optional(),
  casNumber: z.string().optional(),
  hazardLevel: z.enum(['extreme', 'high', 'medium', 'low']).optional(),
  // Inline field editing (3-level: section → subsection → field)
  sectionKey: z.string().optional(),
  subsectionKey: z.string().optional(),
  fieldKey: z.string().optional(),
  fieldContent: z.string().optional(),
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
    const { sectionKey, subsectionKey, fieldKey, fieldContent, ...topLevelUpdates } = updateSchema.parse(body);

    await connectDb();

    // Build the MongoDB $set payload
    const setPayload: Record<string, unknown> = { ...topLevelUpdates };
    const isFieldEdit = sectionKey && subsectionKey && fieldKey && fieldContent !== undefined;
    if (isFieldEdit) {
      const path = `sections.${sectionKey}.subsections.${subsectionKey}.fields.${fieldKey}`;
      setPayload[`${path}.content`] = fieldContent;
      setPayload[`${path}.fieldStatus`] = 'human_approved';
      setPayload[`${path}.confidence`] = 1.0;
    }

    const doc = await SdsDocumentModel.findOneAndUpdate(
      { _id: params.id, customerId: session.user.customerId },
      { $set: setPayload },
      { new: true }
    ).lean();

    if (!doc) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    await AuditLogModel.create({
      customerId: session.user.customerId,
      actorId: session.user.id,
      actorRole: session.user.role,
      actorIp: req.headers.get('x-forwarded-for') ?? 'unknown',
      action: 'update',
      resource: 'sds_document',
      resourceId: params.id,
      after: isFieldEdit ? { sectionKey, subsectionKey, fieldKey, fieldContent } : topLevelUpdates,
    });

    return NextResponse.json({ success: true, data: doc });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.customerId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  await connectDb();
  await SdsDocumentModel.findOneAndUpdate(
    { _id: params.id, customerId: session.user.customerId },
    { status: 'deleted' }
  );

  await AuditLogModel.create({
    customerId: session.user.customerId,
    actorId: session.user.id,
    actorRole: session.user.role,
    actorIp: req.headers.get('x-forwarded-for') ?? 'unknown',
    action: 'delete',
    resource: 'sds_document',
    resourceId: params.id,
  });

  return NextResponse.json({ success: true });
}
