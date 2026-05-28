import { connectDb, CustomerModel } from '@sds360/db';

async function getStats() {
  await connectDb();
  const [total, active, suspended] = await Promise.all([
    CustomerModel.countDocuments(),
    CustomerModel.countDocuments({ status: 'active' }),
    CustomerModel.countDocuments({ status: 'suspended' }),
  ]);
  return { total, active, suspended };
}

export default async function DashboardPage() {
  const stats = await getStats();

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Platform Overview</h1>
      <div className="grid grid-cols-3 gap-6 mb-8">
        <StatCard label="Total Customers" value={stats.total} />
        <StatCard label="Active" value={stats.active} color="green" />
        <StatCard label="Suspended" value={stats.suspended} color="red" />
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  const colorClass =
    color === 'green'
      ? 'text-green-600'
      : color === 'red'
        ? 'text-red-600'
        : 'text-blue-800';
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${colorClass}`}>{value}</p>
    </div>
  );
}
