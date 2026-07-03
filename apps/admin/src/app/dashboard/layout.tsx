import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { signOut } from '@/lib/auth';

const navItems = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/customers', label: 'Customers' },
  { href: '/dashboard/ai-monitor', label: 'AI Monitor' },
  { href: '/dashboard/audit-logs', label: 'Audit Logs' },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect('/login');

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 bg-blue-900 text-white flex flex-col">
        <div className="px-6 py-5 border-b border-blue-800">
          <p className="font-bold text-lg">SDS 360</p>
          <p className="text-xs text-blue-300 mt-0.5">Super Admin</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-3 py-2 rounded-lg text-sm text-blue-100 hover:bg-blue-800 hover:text-white transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="px-6 py-4 border-t border-blue-800">
          <p className="text-xs text-blue-300 mb-2 truncate">{session.user.email}</p>
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/login' });
            }}
          >
            <button className="text-xs text-blue-300 hover:text-white">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
