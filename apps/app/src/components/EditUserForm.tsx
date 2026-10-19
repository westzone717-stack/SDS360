'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface EditableUser {
  id: string;
  name: string;
  department: string;
  email: string;
  role: string;
}

const inputCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500';

/**
 * Edits a user's profile through PATCH /api/users/[id]. Which fields are
 * editable is decided by the caller (mirroring lib/user-permissions); the API
 * enforces the same rules.
 */
export default function EditUserForm({
  user,
  canEditEmail,
  canEditRole,
  onDone,
}: {
  user: EditableUser;
  canEditEmail: boolean;
  canEditRole: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState(user);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const changed = (['name', 'department', 'email', 'role'] as const).filter((k) => form[k] !== user[k]);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const body = Object.fromEntries(changed.map((k) => [k, form[k]]));
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error ?? 'Save failed');
      setMessage({ ok: true, text: 'Saved.' });
      router.refresh();
      onDone?.();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  }

  const set = (k: keyof EditableUser) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setMessage(null);
  };

  return (
    <div className="space-y-3 text-sm text-left">
      <Field label="Name">
        <input className={inputCls} value={form.name} onChange={set('name')} />
      </Field>
      <Field label="Department">
        <input className={inputCls} value={form.department} onChange={set('department')} placeholder="—" />
      </Field>
      <Field label="Email" hint={canEditEmail ? undefined : 'Ask your administrator to change your email.'}>
        <input className={inputCls} type="email" value={form.email} onChange={set('email')} disabled={!canEditEmail} />
      </Field>
      {canEditRole && (
        <Field label="Role">
          <select className={inputCls} value={form.role} onChange={set('role')}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
      )}
      <div className="flex items-center justify-end gap-3 pt-1">
        {message && <span className={`text-xs ${message.ok ? 'text-green-700' : 'text-red-600'}`}>{message.text}</span>}
        {onDone && (
          <button type="button" onClick={onDone} className="text-xs text-gray-500 hover:text-gray-800">
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={saving || changed.length === 0 || !form.name.trim()}
          className="px-4 py-2 text-sm bg-blue-800 text-white rounded-lg hover:bg-blue-900 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-gray-400 mt-1">{hint}</span>}
    </label>
  );
}
