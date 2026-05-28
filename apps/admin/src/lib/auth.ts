import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from './auth.config';
import type { SessionUser } from '@sds360/types';

declare module 'next-auth' {
  interface Session {
    user: SessionUser;
  }
  interface User extends SessionUser {}
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
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

        const { verifyOtp } = await import('./redis');
        const { connectDb } = await import('@sds360/db');
        const { UserModel } = await import('@sds360/db');

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
});
