import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const isDashboard = nextUrl.pathname.startsWith('/dashboard');
  const isLogin = nextUrl.pathname.startsWith('/login');

  if (!isLoggedIn && isDashboard) {
    return Response.redirect(new URL('/login', nextUrl));
  }
  if (isLoggedIn && isLogin) {
    return Response.redirect(new URL('/dashboard', nextUrl));
  }
});

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
