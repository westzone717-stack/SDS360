import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDb, SdsDocumentModel } from '@sds360/db';
import { getPresignedUploadUrl, sdsS3Key, deleteObject } from '@/lib/s3';
import path from 'path';
import { rm } from 'fs/promises';
import { z } from 'zod';
import mongoose from 'mongoose';

const schema = z.object({
  filename: z.string().min(1),
  contentType: z.enum([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
  ]),
  contentHash: z.string().length(64), // SHA-256 hex
});

const IS_DEV_S3 = process.env.AWS_ACCESS_KEY_ID === 'placeholder';

// Extraction runs inside POST /api/sds (maxDuration 300s). A record with no
// extraction result that is older than this can't still be in progress.
const EXTRACTION_STALE_MS = 6 * 60 * 1000;

async function removeStoredFile(s3Key: string) {
  try {
    if (IS_DEV_S3) await rm(path.join(path.resolve(process.cwd(), '../../uploads'), s3Key), { force: true });
    else await deleteObject(s3Key);
  } catch (err) {
    console.warn('[upload-url] Could not delete stale file', s3Key, err);
  }
}

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
    const { filename, contentType, contentHash } = schema.parse(body);

    await connectDb();

    // Reject duplicate documents (same file content already in library)
    const duplicate = await SdsDocumentModel.findOne({
      customerId: session.user.customerId,
      contentHash,
      status: { $ne: 'deleted' },
    })
      .select('productName modelUsed extractionFailedAt createdAt s3Key')
      .lean<{ _id: unknown; productName: string; modelUsed?: string; extractionFailedAt?: Date; createdAt: Date; s3Key: string }>();

    // A previous upload of this file whose AI extraction never succeeded is
    // replaced instead of blocking the retry — unless it may still be running.
    if (duplicate && !duplicate.modelUsed) {
      const stale =
        duplicate.extractionFailedAt || Date.now() - new Date(duplicate.createdAt).getTime() > EXTRACTION_STALE_MS;
      if (!stale) {
        return NextResponse.json(
          { success: false, error: 'This file is still being processed. Please try again in a few minutes.' },
          { status: 409 }
        );
      }
      await SdsDocumentModel.deleteOne({ _id: duplicate._id });
      await removeStoredFile(duplicate.s3Key);
      console.log(`[upload-url] Replacing never-extracted upload ${String(duplicate._id)}`);
    } else if (duplicate) {
      return NextResponse.json(
        { success: false, error: `This document is already in the library as "${duplicate.productName}".` },
        { status: 409 }
      );
    }

    const docId = new mongoose.Types.ObjectId().toString();
    const s3Key = sdsS3Key(session.user.customerId, docId, filename);

    let url: string;
    let fields: Record<string, string>;

    if (IS_DEV_S3) {
      // Dev mode: upload directly to local server instead of S3
      const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
      url = `${appUrl}/api/sds/dev-upload`;
      fields = { docId, key: s3Key };
    } else {
      const result = await getPresignedUploadUrl(s3Key, contentType);
      url = result.url;
      fields = result.fields;
    }

    await SdsDocumentModel.create({
      _id: docId,
      customerId: session.user.customerId,
      productName: filename.replace(/\.[^.]+$/, ''),
      s3Key,
      s3Bucket: process.env.AWS_S3_BUCKET ?? 'local',
      status: 'active',
      reviewStatus: 'pending',
      uploadedBy: session.user.id,
      contentHash,
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
