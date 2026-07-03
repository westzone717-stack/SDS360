import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from './auth.config';
import type { SessionUser } from '@sds360/types';

declare module 'next-auth' {
  interface Session { user: SessionUser; }
  interface User extends SessionUser {}
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      id: 'password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? '').toLowerCase();
        const password = String(credentials?.password ?? '');
        if (!email || !password) return null;

        const bcrypt = await import('bcryptjs');
        const { connectDb, UserModel } = await import('@sds360/db');

        await connectDb();
        const user = await UserModel.findOne({ email, role: 'super_admin', status: 'active' });
        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
          trainingRequired: false,
          forcePasswordChange: user.forcePasswordChange ?? false,
        } satisfies SessionUser;
      },
    }),
  ],
});
