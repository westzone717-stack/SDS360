'use client';

import { useEffect, useMemo, useState } from 'react';

interface UserRecord {
  userId: string;
  name: string;
  email: string;
  department?: string;
  trainingRequired: boolean;
  latestScore: number | null;
  latestPassed: boolean | null;
  completedAt: string | null;
  expiresAt: string | null;
  expired: boolean;
}

type Status = 'certified' | 'failed' | 'expired' | 'never';

function statusOf(r: UserRecord): Status {
  if (r.latestPassed === null) return 'never';
  if (r.latestPassed && !r.expired) return 'certified';
  if (r.latestPassed && r.expired) return 'expired';
  return 'failed';
}

const STATUS_BADGE: Record<Status, { label: string; cls: string }> = {
  certified: { label: '✓ Certified', cls: 'bg-green-100 text-green-700' },
  failed:    { label: '✗ Failed',    cls: 'bg-red-100 text-red-700' },
  expired:   { label: 'Expired',     cls: 'bg-amber-100 text-amber-700' },
  never:     { label: 'Not Taken',   cls: 'bg-gray-100 text-gray-500' },
};

export function UserTrainingSearch() {
  const [records, setRecords] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Status | ''>('');

  useEffect(() => {
    fetch('/api/training/records')
      .then((r) => r.json())
      .then((d: { success: boolean; data?: UserRecord[] }) => {
        if (d.success && d.data) setRecords(d.data);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      if (statusFilter && statusOf(r) !== statusFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.department ?? '').toLowerCase().includes(q)
      );
    });
  }, [records, search, statusFilter]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">User Training Status</h2>
        <span className="text-xs text-gray-400">
          {filtered.length} of {records.length} users
        </span>
      </div>

      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name, email, or department…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as Status | '')}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          <option value="certified">Certified</option>
          <option value="failed">Failed</option>
          <option value="expired">Expired</option>
          <option value="never">Not Taken</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
      ) : (
        <div className="overflow-hidden border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Latest Score</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Last Taken</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Expires</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filtered.map((r) => {
                const status = statusOf(r);
                const badge = STATUS_BADGE[status];
                return (
                  <tr key={r.userId} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{r.name}</div>
                      <div className="text-xs text-gray-500">{r.email}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.department ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-900 font-medium">
                      {r.latestScore !== null ? `${r.latestScore}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {r.completedAt ? new Date(r.completedAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                    {records.length === 0 ? 'No users found.' : 'No users match your search.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
