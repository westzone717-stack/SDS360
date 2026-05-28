import type { NextAuthConfig } from 'next-auth';

// Edge-safe config for middleware
export const authConfig: NextAuthConfig = {
  providers: [],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isDashboard = nextUrl.pathname.startsWith('/dashboard');
      if (!isLoggedIn && isDashboard) return false;
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const u = user as any;
        token.id = u.id;
        token.role = u.role;
        token.status = u.status;
        token.aud = 'super-admin';
      }
      return token;
    },
    session({ session, token }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (session.user as any) = {
        id: token.id,
        email: session.user.email,
        name: session.user.name ?? '',
        role: token.role,
        status: token.status,
        trainingRequired: false,
      };
      return session;
    },
  },
  session: { strategy: 'jwt' },
  secret: process.env.ADMIN_NEXTAUTH_SECRET,
};
