'use client';

import { useState } from 'react';
import TempPasswordCard, { type TempCredential } from '@/components/TempPasswordCard';

export default function ResetPasswordButton({
  customerId,
  userId,
  email,
}: {
  customerId: string;
  userId: string;
  email: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [issued, setIssued] = useState<{ credential: TempCredential; loginUrl: string } | null>(null);

  async function reset() {
    if (!confirm(`Reset the password for ${email}? Their current password stops working immediately.`)) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/customers/${customerId}/users/${userId}/reset-password`, { method: 'POST' });
      const json = (await res.json()) as {
        success: boolean;
        error?: string;
        data?: { email: string; tempPassword: string; emailed: boolean; loginUrl: string };
      };
      if (!json.success || !json.data) throw new Error(json.error ?? 'Reset failed');
      const { loginUrl, ...credential } = json.data;
      setIssued({ credential, loginUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setBusy(false);
    }
  }

  if (issued) {
    return (
      <div className="text-left">
        <TempPasswordCard credentials={[issued.credential]} loginUrl={issued.loginUrl} />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        type="button"
        onClick={reset}
        disabled={busy}
        className="text-blue-600 hover:text-blue-800 text-xs font-medium disabled:opacity-50"
      >
        {busy ? 'Resetting…' : 'Reset password'}
      </button>
    </div>
  );
}
