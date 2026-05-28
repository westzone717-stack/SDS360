import type { NextAuthConfig } from 'next-auth';

// Edge-safe config: no DB/Redis imports. Used by middleware only.
export const authConfig: NextAuthConfig = {
  providers: [],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const pathname = nextUrl.pathname;

      const isPublic =
        pathname.startsWith('/login') ||
        pathname.startsWith('/register') ||
        pathname.startsWith('/api/auth');

      if (!isLoggedIn && !isPublic) return false;
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const u = user as any;
        token.id = u.id;
        token.role = u.role;
        token.customerId = u.customerId;
        token.status = u.status;
        token.trainingRequired = u.trainingRequired;
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
        customerId: token.customerId,
        status: token.status,
        trainingRequired: token.trainingRequired ?? false,
      };
      return session;
    },
  },
  session: { strategy: 'jwt' },
  secret: process.env.APP_NEXTAUTH_SECRET,
};
