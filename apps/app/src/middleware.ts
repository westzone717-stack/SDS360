import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const session = req.auth;
  // Require session.user.id to exist — guards against stale/malformed session cookies
  // that pass the !!session check but have no populated user data, causing redirect loops.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isLoggedIn = !!(session?.user as any)?.id;

  const isPublic =
    nextUrl.pathname.startsWith('/login') ||
    nextUrl.pathname.startsWith('/register') ||
    nextUrl.pathname.startsWith('/api/auth') ||
    // Static asset served from public/ for the PDF.js worker — it's a
    // library file, not user data, and must load even mid-redirect (e.g.
    // dynamically imported by a Worker before any auth-gated navigation
    // completes). Redirecting it to /login breaks the module fetch: the
    // browser gets back HTML instead of JS and rejects it outright.
    nextUrl.pathname === '/pdf.worker.min.mjs';

  if (!isLoggedIn && !isPublic) {
    return Response.redirect(new URL('/login', nextUrl));
  }

  if (isLoggedIn && (nextUrl.pathname === '/login' || nextUrl.pathname === '/register')) {
    return Response.redirect(new URL('/', nextUrl));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = (session?.user as any) ?? {};

  // Force password change gate — must be cleared before anything else
  const forcePasswordChange = user?.forcePasswordChange;
  if (isLoggedIn && forcePasswordChange) {
    const isChangePasswordRoute =
      nextUrl.pathname.startsWith('/change-password') ||
      nextUrl.pathname.startsWith('/api/auth/change-password') ||
      nextUrl.pathname.startsWith('/api/auth');
    if (!isChangePasswordRoute) {
      return Response.redirect(new URL('/change-password', nextUrl));
    }
  }

  // Training gate — only applies to regular users (User role), not admins/managers
  // SDS Library (query + PDF download) is always accessible regardless of training status.
  const trainingRequired = user?.trainingRequired;
  const isUserRole = user?.role === 'user';
  if (isLoggedIn && !forcePasswordChange && trainingRequired && isUserRole) {
    const isAllowedWithoutTraining =
      nextUrl.pathname.startsWith('/training') ||
      nextUrl.pathname.startsWith('/api/training') ||
      nextUrl.pathname.startsWith('/sds') ||
      nextUrl.pathname.startsWith('/api/sds');
    if (!isAllowedWithoutTraining && !isPublic) {
      return Response.redirect(new URL('/training', nextUrl));
    }
  }
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
