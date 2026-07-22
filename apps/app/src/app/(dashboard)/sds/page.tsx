import { auth } from '@/lib/auth';
import { connectDb, SdsDocumentModel } from '@sds360/db';
import Link from 'next/link';
import type { HazardLevel } from '@sds360/types';
import mongoose from 'mongoose';
import { RefreshOnMount } from '@/components/RefreshOnMount';
import { DeleteSdsButton } from './DeleteSdsButton';

// Force dynamic rendering — data changes per-user and per-request
export const dynamic = 'force-dynamic';

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

const reviewBadge: Record<string, string> = {
  pending:        'bg-amber-100 text-amber-700',
  ai_approved:    'bg-blue-100 text-blue-700',
  human_approved: 'bg-green-100 text-green-700',
};

const reviewLabel: Record<string, string> = {
  pending:        'Pending Review',
  ai_approved:    'AI Approved',
  human_approved: 'Published',
};

async function getSdsList(customerId: string, isAdmin: boolean, search?: string, hazard?: string) {
  await connectDb();
  console.log('[SDS page] customerId:', customerId, 'isAdmin:', isAdmin);
  if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
    console.error('[SDS page] invalid customerId:', customerId);
    return [];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {
    customerId: new mongoose.Types.ObjectId(customerId),
    status: 'active',
  };
  if (!isAdmin) filter.reviewStatus = 'human_approved';
  if (search) filter.$text = { $search: search };
  if (hazard) filter.hazardLevel = hazard;

  console.log('[SDS page] filter:', JSON.stringify(filter));
  const docs = await SdsDocumentModel.find(filter)
    .select('productName casNumber hazardLevel reviewStatus createdAt version')
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  console.log('[SDS page] docs found:', docs.length);
  return docs;
}

export default async function SdsListPage({
  searchParams,
}: {
  searchParams: { q?: string; hazard?: string };
}) {
  const session = await auth();
  const isAdmin = session?.user.role === 'admin';
  const docs = await getSdsList(session!.user.customerId!, isAdmin, searchParams.q, searchParams.hazard);

  const pending = docs.filter((d) => d.reviewStatus !== 'human_approved');
  const published = docs.filter((d) => d.reviewStatus === 'human_approved');

  return (
    <div>
      <RefreshOnMount />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SDS Library</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAdmin
              ? `${docs.length} total · ${pending.length} pending review`
              : `${docs.length} documents`}
          </p>
        </div>
        {isAdmin && (
          <Link href="/sds/upload" className="bg-blue-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-900">
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

      {/* Pending review section — admin only */}
      {isAdmin && pending.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
            Pending Review ({pending.length})
          </h2>
          <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-amber-200">
                <tr>
                  {['Product Name', 'CAS Number', 'Hazard Level', 'Version', 'Uploaded', 'Status', ''].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-amber-700 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {pending.map((doc) => (
                  <tr key={String(doc._id)} className="hover:bg-amber-100/50">
                    <td className="px-4 py-3 font-medium text-gray-900">{doc.productName}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{doc.casNumber ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${hazardBadge[doc.hazardLevel as HazardLevel]}`}>
                        {hazardLabel[doc.hazardLevel as HazardLevel]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">v{doc.version}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(doc.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${reviewBadge[doc.reviewStatus]}`}>
                        {reviewLabel[doc.reviewStatus]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          href={`/sds/${String(doc._id)}/review`}
                          className="text-amber-700 hover:text-amber-900 text-xs font-semibold"
                        >
                          Review →
                        </Link>
                        <DeleteSdsButton id={String(doc._id)} productName={doc.productName} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Published documents */}
      <div>
        {isAdmin && <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Published ({published.length})</h2>}
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
              {published.map((doc) => (
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
                    <div className="flex items-center justify-end gap-3">
                      <Link href={`/sds/${String(doc._id)}`} className="text-blue-600 hover:text-blue-800 text-xs font-medium">
                        View Details →
                      </Link>
                      {isAdmin && <DeleteSdsButton id={String(doc._id)} productName={doc.productName} />}
                    </div>
                  </td>
                </tr>
              ))}
              {published.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                    {isAdmin ? 'No published documents yet. Review pending items above.' : 'No SDS documents found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
