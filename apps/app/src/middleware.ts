import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { SessionUser } from '@sds360/types';

type AuthRequest = NextRequest & { auth: { user: SessionUser } | null };

export default auth((req: AuthRequest) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;
  const isLoggedIn = !!session;

  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/api/auth');

  if (!isLoggedIn && !isPublic) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (isLoggedIn && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  // Training gate: redirect to /training if training is required, except on training routes
  if (isLoggedIn && session.user.trainingRequired) {
    const isTrainingRoute = pathname.startsWith('/training') || pathname.startsWith('/api/training');
    if (!isTrainingRoute && !isPublic) {
      return NextResponse.redirect(new URL('/training', req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
