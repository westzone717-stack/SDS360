import { auth } from '@/lib/auth';
import { connectDb, SdsDocumentModel } from '@sds360/db';
import Link from 'next/link';
import type { HazardLevel } from '@sds360/types';

const hazardBadge: Record<HazardLevel, string> = {
  extreme: 'bg-red-100 text-red-700 border border-red-200',
  high: 'bg-amber-100 text-amber-700 border border-amber-200',
  medium: 'bg-blue-100 text-blue-700 border border-blue-200',
  low: 'bg-green-100 text-green-700 border border-green-200',
};

const hazardLabel: Record<HazardLevel, string> = {
  extreme: '☠ Extreme',
  high: '⚠ High',
  medium: '◆ Medium',
  low: 'ℹ Low',
};

async function getSdsList(customerId: string, search?: string) {
  await connectDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = { customerId, status: 'active', reviewStatus: 'human_approved' };
  if (search) {
    filter.$text = { $search: search };
  }
  return SdsDocumentModel.find(filter)
    .select('productName casNumber hazardLevel reviewStatus createdAt version')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
}

export default async function SdsListPage({
  searchParams,
}: {
  searchParams: { q?: string; hazard?: string };
}) {
  const session = await auth();
  const docs = await getSdsList(session!.user.customerId!, searchParams.q);

  const filtered = searchParams.hazard
    ? docs.filter((d) => d.hazardLevel === searchParams.hazard)
    : docs;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SDS Library</h1>
          <p className="text-sm text-gray-500 mt-1">{filtered.length} documents</p>
        </div>
        {(session?.user.role === 'admin') && (
          <Link
            href="/sds/upload"
            className="bg-blue-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-900"
          >
            + Upload SDS
          </Link>
        )}
      </div>

      {/* Search + Filters */}
      <form method="GET" className="flex gap-3 mb-6">
        <input
          name="q"
          defaultValue={searchParams.q}
          placeholder="Search by product name or CAS number…"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          name="hazard"
          defaultValue={searchParams.hazard}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Hazard Levels</option>
          <option value="extreme">Extreme</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <button type="submit" className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm">Search</button>
      </form>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Product Name', 'CAS Number', 'Hazard Level', 'Version', 'Added'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
              ))}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((doc) => (
              <tr key={String(doc._id)} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{doc.productName}</td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{doc.casNumber ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${hazardBadge[doc.hazardLevel as HazardLevel]}`}>
                    {hazardLabel[doc.hazardLevel as HazardLevel]}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">v{doc.version}</td>
                <td className="px-4 py-3 text-gray-500">{new Date(doc.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/sds/${String(doc._id)}`}
                    className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                  >
                    View Details →
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  No SDS documents found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
