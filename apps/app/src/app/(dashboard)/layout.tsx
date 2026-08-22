import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { signOut } from '@/lib/auth';
import type { UserRole } from '@sds360/types';

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

  return items;
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  // Redirect if session is missing or has an invalid/stale JWT (role undefined)
  if (!session?.user?.id || !session.user.role) redirect('/login');

  const nav = buildNav(session.user.role);

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
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/login' });
            }}
          >
            <button className="text-xs text-gray-400 hover:text-gray-600">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-gray-50">
        <div className="max-w-7xl mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
