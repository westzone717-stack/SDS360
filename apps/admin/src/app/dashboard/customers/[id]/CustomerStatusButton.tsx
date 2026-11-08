'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Deactivate (suspend) or reactivate a customer. Deactivation blocks all of its users immediately. */
export default function CustomerStatusButton({ id, name, status }: { id: string; name: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = status === 'active';

  async function toggle() {
    const msg = active
      ? `Deactivate ${name}? All of its users will be signed out of the customer portal and unable to log in until it is reactivated.`
      : `Reactivate ${name}? Its users will be able to log in again.`;
    if (!confirm(msg)) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: active ? 'suspended' : 'active' }),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error ?? 'Update failed');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`px-4 py-2 rounded-lg text-sm font-medium border disabled:opacity-50 ${
          active
            ? 'border-red-300 text-red-600 hover:bg-red-50'
            : 'border-green-300 text-green-700 hover:bg-green-50'
        }`}
      >
        {busy ? 'Saving…' : active ? 'Deactivate Customer' : 'Reactivate Customer'}
      </button>
    </div>
  );
}
