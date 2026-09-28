'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import TempPasswordCard, { type TempCredential } from '@/components/TempPasswordCard';

type Issued = { credential: TempCredential; loginUrl: string };

export default function PendingActions({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState('');
  const [issued, setIssued] = useState<Issued | null>(null);

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
      const json = (await res.json()) as {
        success: boolean;
        error?: string;
        data?: { email?: string; role?: string; tempPassword?: string; emailed?: boolean; loginUrl?: string };
      };
      if (!json.success) throw new Error(json.error ?? 'Request failed');
      const d = json.data;
      if (d?.tempPassword && d.email && d.loginUrl) {
        // Keep the password on screen; the row updates once the admin dismisses it
        setIssued({
          credential: { email: d.email, role: d.role, tempPassword: d.tempPassword, emailed: d.emailed ?? false },
          loginUrl: d.loginUrl,
        });
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(null);
    }
  }

  if (issued) {
    return <IssuedPassword issued={issued} onDone={() => router.refresh()} />;
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

export function ResetPasswordButton({ userId, email }: { userId: string; email: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [issued, setIssued] = useState<Issued | null>(null);

  async function reset() {
    if (!confirm(`Reset the password for ${email}? Their current password stops working immediately.`)) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/users/${userId}/reset-password`, { method: 'POST' });
      const json = (await res.json()) as {
        success: boolean;
        error?: string;
        data?: { email: string; role: string; tempPassword: string; emailed: boolean; loginUrl: string };
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
    return <IssuedPassword issued={issued} onDone={() => setIssued(null)} />;
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

function IssuedPassword({ issued, onDone }: { issued: Issued; onDone: () => void }) {
  return (
    <div className="text-left space-y-2">
      <TempPasswordCard credentials={[issued.credential]} loginUrl={issued.loginUrl} />
      <div className="text-right">
        <button onClick={onDone} className="text-xs font-medium text-gray-600 hover:text-gray-900">
          Done
        </button>
      </div>
    </div>
  );
}
