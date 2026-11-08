import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { signOut } from '@/lib/auth';
import type { UserRole } from '@sds360/types';
import { connectDb, CustomerModel } from '@sds360/db';

function buildNav(role: UserRole) {
  const items: Array<{ href: string; label: string }> = [];

  // SDS is always visible to all active users
  items.push({ href: '/sds', label: 'SDS Library' });

  if (role === 'user') {
    items.push({ href: '/training', label: 'My Training' });
    items.push({ href: '/training/history', label: 'Training History' });
    items.push({ href: '/analysis', label: 'Analysis' });
  }

  if (role === 'admin') {
    items.push(
      { href: '/sds/upload', label: 'Upload SDS' },
      { href: '/training', label: 'Training Dashboard' },
      { href: '/training/quiz-bank', label: 'Quiz Bank' },
      { href: '/analysis', label: 'Analysis' },
      { href: '/users', label: 'Users' }
    );
  }

  if (role === 'access_manager') {
    items.push({ href: '/users', label: 'User Management' });
  }

  items.push({ href: '/profile', label: 'My Profile' });

  return items;
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  // Redirect if session is missing or has an invalid/stale JWT (role undefined)
  if (!session?.user?.id || !session.user.role) redirect('/login');

  const nav = buildNav(session.user.role);

  // Company the user belongs to — shown in the header, and re-checked on every
  // page so a customer the super admin deactivates loses access immediately
  // (not just at next login).
  await connectDb();
  const customer = session.user.customerId
    ? await CustomerModel.findById(session.user.customerId).select('name status').lean<{ name: string; status: string }>()
    : null;
  const signOutAction = async () => {
    'use server';
    await signOut({ redirectTo: '/login' });
  };

  if (!customer || customer.status !== 'active') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-xl border border-gray-200 p-6 text-center">
          <p className="font-bold text-lg text-blue-900 mb-2">SDS 360</p>
          <p className="text-gray-800 font-medium">
            {customer ? `${customer.name}'s account is currently inactive.` : 'Your organization could not be found.'}
          </p>
          <p className="text-sm text-gray-500 mt-2">Please contact your SDS 360 administrator.</p>
          <form action={signOutAction} className="mt-5">
            <button className="text-sm text-blue-700 border border-blue-300 rounded-lg px-4 py-2 hover:bg-blue-50">Sign out</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col shadow-sm">
        <div className="px-6 py-5 border-b border-gray-100">
          <p className="font-bold text-lg text-blue-900">SDS 360</p>
          <p className="text-xs text-gray-400 mt-0.5 capitalize">{session.user.role.replace('_', ' ')}</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-800 transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="px-6 py-4 border-t border-gray-100">
          <p className="text-xs text-gray-500 truncate mb-1">{session.user.name}</p>
          <p className="text-xs text-gray-400 truncate mb-2">{session.user.email}</p>
          <form action={signOutAction}>
            <button className="text-xs text-gray-400 hover:text-gray-600">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-gray-50">
        <div className="max-w-7xl mx-auto px-8 py-8">
          <p className="inline-block mb-4 px-3 py-1 rounded-lg bg-blue-50 border border-blue-100 text-sm font-semibold text-blue-900">
            {customer.name}
          </p>
          {children}
        </div>
      </main>
    </div>
  );
}
