import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const session = req.auth;
  const isLoggedIn = !!session;

  const isPublic =
    nextUrl.pathname.startsWith('/login') ||
    nextUrl.pathname.startsWith('/register') ||
    nextUrl.pathname.startsWith('/api/auth');

  if (!isLoggedIn && !isPublic) {
    return Response.redirect(new URL('/login', nextUrl));
  }

  if (isLoggedIn && (nextUrl.pathname === '/login' || nextUrl.pathname === '/register')) {
    return Response.redirect(new URL('/', nextUrl));
  }

  // Training gate — no DB call needed, trainingRequired is in the JWT
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trainingRequired = (session?.user as any)?.trainingRequired;
  if (isLoggedIn && trainingRequired) {
    const isTrainingRoute =
      nextUrl.pathname.startsWith('/training') ||
      nextUrl.pathname.startsWith('/api/training');
    if (!isTrainingRoute && !isPublic) {
      return Response.redirect(new URL('/training', nextUrl));
    }
  }
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
