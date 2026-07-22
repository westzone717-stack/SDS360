import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

// Dev-only local file storage — replaces S3 presigned POST upload.
// Files are saved to <project-root>/uploads/<s3Key path>.
export async function POST(req: Request) {
  if (process.env.AWS_ACCESS_KEY_ID !== 'placeholder') {
    return NextResponse.json({ success: false, error: 'Not available in production' }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const s3Key = formData.get('key') as string | null;

    if (!file || !s3Key) {
      return NextResponse.json({ success: false, error: 'Missing file or key' }, { status: 400 });
    }

    // Save to <project-root>/uploads/<s3Key>
    const uploadRoot = path.resolve(process.cwd(), '../../uploads');
    const filePath = path.join(uploadRoot, s3Key);
    await mkdir(path.dirname(filePath), { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    console.log(`[dev-upload] Saved ${file.name} → ${filePath}`);

    // S3 presigned POST responds with 204 on success — match that
    return new Response(null, { status: 204 });
  } catch (err) {
    console.error('[dev-upload]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
