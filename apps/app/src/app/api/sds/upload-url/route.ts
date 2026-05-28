import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, SdsDocumentModel } from '@sds360/db';
import { getPresignedUploadUrl, sdsS3Key } from '@/lib/s3';
import { z } from 'zod';
import mongoose from 'mongoose';

const schema = z.object({
  filename: z.string().min(1),
  contentType: z.enum(['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg']),
});

const ALLOWED_TYPES = new Set(['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg']);

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.customerId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden — upload requires Admin role' }, { status: 403 });
  }

  try {
    const body = await req.json() as unknown;
    const { filename, contentType } = schema.parse(body);

    await connectDb();

    // Create a placeholder document record to get an ID
    const docId = new mongoose.Types.ObjectId().toString();
    const s3Key = sdsS3Key(session.user.customerId, docId, filename);

    const { url, fields } = await getPresignedUploadUrl(s3Key, contentType);

    // Create pending SDS document
    await SdsDocumentModel.create({
      _id: docId,
      customerId: session.user.customerId,
      productName: filename.replace(/\.[^.]+$/, ''),
      s3Key,
      s3Bucket: process.env.AWS_S3_BUCKET!,
      status: 'active',
      reviewStatus: 'pending',
      uploadedBy: session.user.id,
    });

    return NextResponse.json({ success: true, data: { url, fields, docId } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.errors[0].message }, { status: 400 });
    }
    console.error('[upload-url]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
