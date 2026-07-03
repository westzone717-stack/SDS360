import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { circuitBreaker } from '@sds360/llm';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const states = circuitBreaker.getAllStates();
  return NextResponse.json({ success: true, data: states });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { provider, action } = (await req.json()) as { provider: 'claude' | 'gpt' | 'ollama'; action: 'reset' };
  if (action === 'reset') circuitBreaker.recordSuccess(provider);

  return NextResponse.json({ success: true });
}
