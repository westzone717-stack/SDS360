import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { connectDb, UserModel } from '@sds360/db';
import EditUserForm from '@/components/EditUserForm';
import { canEditEmail } from '@/lib/user-permissions';

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  await connectDb();
  const me = await UserModel.findById(session.user.id)
    .select('name email role department')
    .lean<{ name: string; email: string; role: string; department?: string }>();
  if (!me) redirect('/login');

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Profile</h1>
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-xs text-gray-500 mb-4">
          Role: <span className="capitalize font-medium text-gray-700">{me.role.replace('_', ' ')}</span>
        </p>
        <EditUserForm
          user={{ id: session.user.id, name: me.name, department: me.department ?? '', email: me.email, role: me.role }}
          canEditEmail={canEditEmail({ id: session.user.id, role: me.role }, { id: session.user.id, role: me.role })}
          canEditRole={false}
        />
      </div>
      <p className="text-sm text-gray-500 mt-4">
        Want a new password?{' '}
        <Link href="/change-password" className="text-blue-600 hover:text-blue-800 font-medium">
          Change password
        </Link>
      </p>
    </div>
  );
}
