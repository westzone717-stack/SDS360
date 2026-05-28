import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export default auth((req: NextRequest & { auth: { user?: { role?: string } } | null }) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const isLoginPage = pathname.startsWith('/login');
  const isDashboard = pathname.startsWith('/dashboard');

  if (!isLoggedIn && isDashboard) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
