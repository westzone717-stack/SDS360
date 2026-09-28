import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { connectDb, UserModel } from '@sds360/db';
import mongoose from 'mongoose';
import type { UserRole, UserStatus } from '@sds360/types';
import PendingActions, { ResetPasswordButton, StatusToggleButton } from './PendingActions';
import { canManage } from '@/lib/user-permissions';

const roleBadge: Record<UserRole, string> = {
  super_admin: 'bg-purple-100 text-purple-700',
  access_manager: 'bg-indigo-100 text-indigo-700',
  admin: 'bg-blue-100 text-blue-700',
  user: 'bg-gray-100 text-gray-700',
};

const statusBadge: Record<UserStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  active: 'bg-green-100 text-green-700',
  suspended: 'bg-red-100 text-red-700',
};

async function getUsers(customerId: string) {
  await connectDb();
  return UserModel.find({ customerId: new mongoose.Types.ObjectId(customerId) })
    .select('name email role status department createdAt')
    .sort({ role: 1, createdAt: -1 })
    .lean();
}

export default async function UsersPage() {
  const session = await auth();
  const role = session?.user.role;

  if (role !== 'admin' && role !== 'access_manager') {
    redirect('/sds');
  }

  const users = await getUsers(session!.user.customerId!);
  const isReadOnly = role === 'access_manager';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        {!isReadOnly && (
          <button className="bg-blue-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-900">
            + Invite User
          </button>
        )}
      </div>

      {isReadOnly && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700">
          You can approve access requests, reset passwords, and deactivate or reactivate Admin and User accounts.
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Name', 'Email', 'Role', 'Department', 'Status', 'Joined'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
              ))}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => (
              <tr key={String(u._id)} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${roleBadge[u.role as UserRole]}`}>
                    {u.role.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{u.department ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge[u.status as UserStatus]}`}>
                    {u.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  {u.role === 'user' && u.status === 'pending' ? (
                    <PendingActions userId={String(u._id)} name={u.name} />
                  ) : (
                    <div className="flex items-center justify-end gap-3">
                      {canManage({ id: session!.user.id, role: role! }, { id: String(u._id), role: u.role }) && (
                        <>
                          {u.status === 'active' && <ResetPasswordButton userId={String(u._id)} email={u.email} />}
                          <StatusToggleButton userId={String(u._id)} email={u.email} status={u.status} />
                        </>
                      )}
                      {!isReadOnly && <button className="text-blue-600 hover:text-blue-800 text-xs font-medium">Manage</button>}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
