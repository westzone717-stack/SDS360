import { S3Client, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? 'ap-northeast-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET ?? 'sds360-documents';

export async function getPresignedUploadUrl(key: string, contentType: string) {
  const { url, fields } = await createPresignedPost(s3, {
    Bucket: BUCKET,
    Key: key,
    Conditions: [
      ['content-length-range', 1, 50 * 1024 * 1024], // max 50MB
      ['eq', '$Content-Type', contentType],
    ],
    Fields: { 'Content-Type': contentType },
    Expires: 300, // 5 minutes to upload
  });
  return { url, fields };
}

export async function getPresignedDownloadUrl(key: string): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: 3600 } // 1 hour
  );
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

export function sdsS3Key(customerId: string, documentId: string, filename: string): string {
  return `sds/${customerId}/${documentId}/${filename}`;
}
