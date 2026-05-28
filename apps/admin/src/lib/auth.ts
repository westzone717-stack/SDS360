import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { connectDb, UserModel } from '@sds360/db';
import { verifyOtp } from './redis';
import type { SessionUser } from '@sds360/types';

declare module 'next-auth' {
  interface Session {
    user: SessionUser;
  }
  interface User extends SessionUser {}
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      id: 'otp',
      credentials: {
        email: { label: 'Email', type: 'email' },
        otp: { label: 'OTP', type: 'text' },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? '').toLowerCase();
        const otp = String(credentials?.otp ?? '');
        if (!email || !otp) return null;

        const valid = await verifyOtp(email, otp);
        if (!valid) return null;

        await connectDb();
        const user = await UserModel.findOne({ email, role: 'super_admin', status: 'active' });
        if (!user) return null;

        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
          trainingRequired: false,
        } satisfies SessionUser;
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as SessionUser).role;
        token.status = (user as SessionUser).status;
        token.aud = 'super-admin';
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        id: token.id as string,
        email: session.user.email,
        name: session.user.name ?? '',
        role: token.role as SessionUser['role'],
        status: token.status as SessionUser['status'],
        trainingRequired: false,
      };
      return session;
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  session: { strategy: 'jwt' },
  secret: process.env.ADMIN_NEXTAUTH_SECRET,
});
