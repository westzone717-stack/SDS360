import { connectDb, CustomerModel, UserModel } from '@sds360/db';
import type { CustomerDoc, UserDoc } from '@sds360/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import ResetPasswordButton from './ResetPasswordButton';
import EditCustomerForm from './EditCustomerForm';
import CustomerStatusButton from './CustomerStatusButton';

async function getData(id: string) {
  await connectDb();
  const [customer, users] = await Promise.all([
    CustomerModel.findById(id) as unknown as Promise<CustomerDoc | null>,
    UserModel.find({ customerId: id }).select('name email role status') as unknown as Promise<UserDoc[]>,
  ]);
  return { customer, users };
}

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const { customer, users } = await getData(params.id);
  if (!customer) notFound();

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <Link href="/dashboard/customers" className="text-sm text-gray-400 hover:text-gray-600 mb-2 block">
          ← Customers
        </Link>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                customer.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}
            >
              {customer.status === 'active' ? 'active' : `inactive (${customer.status})`}
            </span>
          </div>
          <CustomerStatusButton id={params.id} name={customer.name} status={customer.status} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-700 mb-3 text-sm">Customer Details</h2>
          <dl className="space-y-2 text-sm">
            <Row label="Plan" value={customer.plan} />
            <Row label="Status" value={customer.status} />
            <Row label="Domain" value={customer.domain ?? '—'} />
            <Row label="Max Users" value={String(customer.maxUsers)} />
            <Row label="Max SDS Documents" value={String(customer.maxSdsDocuments)} />
            <Row label="Contract Expires" value={new Date(customer.contractExpiresAt).toLocaleDateString()} />
            <Row label="Created" value={new Date(customer.createdAt).toLocaleDateString()} />
          </dl>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-700 mb-3 text-sm">Edit Customer</h2>
          <EditCustomerForm
            customer={{
              id: params.id,
              name: customer.name,
              domain: customer.domain ?? '',
              plan: customer.plan,
              status: customer.status,
              maxUsers: customer.maxUsers,
              maxSdsDocuments: customer.maxSdsDocuments,
              contractExpiresAt: new Date(customer.contractExpiresAt).toISOString().slice(0, 10),
            }}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Users ({users.length})</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Name', 'Email', 'Role', 'Status'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
              ))}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => (
              <tr key={String(u._id)}>
                <td className="px-4 py-3 text-gray-900">{u.name}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{u.email}</td>
                <td className="px-4 py-3 capitalize text-gray-600">{u.role.replace('_', ' ')}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {u.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {(u.role === 'access_manager' || u.role === 'admin') && (
                    <ResetPasswordButton customerId={params.id} userId={String(u._id)} email={u.email} />
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex">
      <dt className="w-36 text-gray-500 shrink-0">{label}</dt>
      <dd className="font-medium text-gray-900 capitalize">{value}</dd>
    </div>
  );
}
