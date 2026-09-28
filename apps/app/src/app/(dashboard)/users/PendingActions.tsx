'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PendingActions({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState('');

  async function act(action: 'approve' | 'reject') {
    if (action === 'reject' && !confirm(`Reject the access request from ${name}?`)) return;
    setBusy(action);
    setError('');
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action }),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error ?? 'Request failed');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        onClick={() => act('approve')}
        disabled={busy !== null}
        className="px-2.5 py-1 rounded-md text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
      >
        {busy === 'approve' ? 'Approving…' : 'Approve'}
      </button>
      <button
        onClick={() => act('reject')}
        disabled={busy !== null}
        className="px-2.5 py-1 rounded-md text-xs font-medium border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
      >
        {busy === 'reject' ? 'Rejecting…' : 'Reject'}
      </button>
    </div>
  );
}
