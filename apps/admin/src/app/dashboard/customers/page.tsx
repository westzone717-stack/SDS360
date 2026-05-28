import { connectDb, CustomerModel } from '@sds360/db';
import Link from 'next/link';

async function getCustomers() {
  await connectDb();
  return CustomerModel.find().sort({ createdAt: -1 }).limit(100).lean();
}

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  suspended: 'bg-yellow-100 text-yellow-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default async function CustomersPage() {
  const customers = await getCustomers();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
        <Link
          href="/dashboard/customers/new"
          className="bg-blue-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-900"
        >
          + New Customer
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Name', 'Plan', 'Status', 'Contract Expires', 'Created'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  {h}
                </th>
              ))}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {customers.map((c) => (
              <tr key={String(c._id)} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                <td className="px-4 py-3 capitalize text-gray-600">{c.plan}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[c.status]}`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {new Date(c.contractExpiresAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(c.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/dashboard/customers/${String(c._id)}`}
                    className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                  >
                    Manage →
                  </Link>
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No customers yet. Create the first one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
