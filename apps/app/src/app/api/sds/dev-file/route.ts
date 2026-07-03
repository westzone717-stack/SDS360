import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { readFile } from 'fs/promises';
import path from 'path';

// Dev-only: serve locally stored SDS files instead of S3
export async function GET(req: Request) {
  if (process.env.AWS_ACCESS_KEY_ID !== 'placeholder') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  const session = await auth();
  if (!session?.user?.customerId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 });

  // Security: key must belong to the user's tenant
  if (!key.includes(session.user.customerId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const uploadRoot = path.resolve(process.cwd(), '../../uploads');
    const filePath = path.join(uploadRoot, key);
    const buffer = await readFile(filePath);

    const ext = path.extname(key).toLowerCase();
    const contentType =
      ext === '.pdf' ? 'application/pdf' :
      ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
      ext === '.png' ? 'image/png' : 'image/jpeg';

    return new Response(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${path.basename(key)}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
