import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { connectDb, UserModel, CustomerModel } from '@sds360/db';
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

        const user = await UserModel.findOne({ email, status: 'active' });
        if (!user) return null;

        // Verify customer is still active
        const customer = await CustomerModel.findById(user.customerId);
        if (!customer || customer.status !== 'active') return null;

        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
          customerId: user.customerId.toString(),
          status: user.status,
          trainingRequired: user.trainingStatus?.required ?? false,
        } satisfies SessionUser;
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as SessionUser;
        token.id = u.id;
        token.role = u.role;
        token.customerId = u.customerId;
        token.status = u.status;
        token.trainingRequired = u.trainingRequired;
        token.aud = 'app';
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        id: token.id as string,
        email: session.user.email,
        name: session.user.name ?? '',
        role: token.role as SessionUser['role'],
        customerId: token.customerId as string,
        status: token.status as SessionUser['status'],
        trainingRequired: token.trainingRequired as boolean,
      };
      return session;
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  session: { strategy: 'jwt' },
  secret: process.env.APP_NEXTAUTH_SECRET,
});
