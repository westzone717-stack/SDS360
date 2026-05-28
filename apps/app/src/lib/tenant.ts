import { auth } from './auth';
import { NextResponse } from 'next/server';

// Injects customer_id from session into every query. Guards against cross-tenant access.
export async function withTenant<T>(
  handler: (customerId: string, userId: string, role: string) => Promise<T>
): Promise<T | NextResponse> {
  const session = await auth();
  if (!session?.user?.customerId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  return handler(session.user.customerId, session.user.id, session.user.role);
}
