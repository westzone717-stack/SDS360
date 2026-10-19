'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface EditableCustomer {
  id: string;
  name: string;
  domain: string;
  plan: 'starter' | 'professional' | 'enterprise';
  status: 'active' | 'suspended' | 'cancelled';
  maxUsers: number;
  maxSdsDocuments: number;
  contractExpiresAt: string; // YYYY-MM-DD
}

const inputCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

export default function EditCustomerForm({ customer }: { customer: EditableCustomer }) {
  const router = useRouter();
  const [form, setForm] = useState(customer);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function update<K extends keyof EditableCustomer>(key: K, value: EditableCustomer[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setMessage(null);
  }

  // Only send what changed
  const changes = (Object.keys(form) as Array<keyof EditableCustomer>).filter(
    (k) => k !== 'id' && form[k] !== customer[k]
  );

  async function save() {
    if (form.status !== customer.status && form.status !== 'active') {
      const ok = confirm(
        `Set ${customer.name} to "${form.status}"? Its users will no longer be able to log in.`
      );
      if (!ok) return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const body = Object.fromEntries(changes.map((k) => [k, form[k]]));
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error ?? 'Save failed');
      setMessage({ ok: true, text: 'Saved.' });
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <Field label="Company name">
        <input className={inputCls} value={form.name} onChange={(e) => update('name', e.target.value)} />
      </Field>
      <Field
        label="Domain"
        hint="Company-owned domain only. Employees with this email domain can request access; leave blank to disable self-registration."
      >
        <input
          className={inputCls}
          value={form.domain}
          placeholder="acme.com"
          onChange={(e) => update('domain', e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Plan">
          <select className={inputCls} value={form.plan} onChange={(e) => update('plan', e.target.value as EditableCustomer['plan'])}>
            <option value="starter">Starter</option>
            <option value="professional">Professional</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </Field>
        <Field label="Status">
          <select className={inputCls} value={form.status} onChange={(e) => update('status', e.target.value as EditableCustomer['status'])}>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </Field>
        <Field label="Max users">
          <input
            type="number"
            min={1}
            className={inputCls}
            value={form.maxUsers}
            onChange={(e) => update('maxUsers', Number(e.target.value))}
          />
        </Field>
        <Field label="Max SDS documents">
          <input
            type="number"
            min={1}
            className={inputCls}
            value={form.maxSdsDocuments}
            onChange={(e) => update('maxSdsDocuments', Number(e.target.value))}
          />
        </Field>
      </div>
      <Field label="Contract expires">
        <input
          type="date"
          className={inputCls}
          value={form.contractExpiresAt}
          onChange={(e) => update('contractExpiresAt', e.target.value)}
        />
      </Field>

      <div className="flex items-center justify-end gap-3 pt-1">
        {message && <span className={`text-xs ${message.ok ? 'text-green-700' : 'text-red-600'}`}>{message.text}</span>}
        {changes.length > 0 && (
          <button type="button" onClick={() => setForm(customer)} className="text-xs text-gray-500 hover:text-gray-800">
            Discard
          </button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={saving || changes.length === 0 || !form.name.trim()}
          className="px-4 py-2 text-sm bg-blue-800 text-white rounded-lg hover:bg-blue-900 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save changes'}
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
