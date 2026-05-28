'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface FormData {
  name: string;
  domain: string;
  plan: 'starter' | 'professional' | 'enterprise';
  contractMonths: number;
  maxUsers: number;
  accessManagerEmail: string;
  accessManagerName: string;
  adminEmails: string[];
}

const STEPS = ['Company Info', 'Plan', 'Initial Accounts', 'Confirm'];

export default function NewCustomerPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<FormData>({
    name: '',
    domain: '',
    plan: 'starter',
    contractMonths: 12,
    maxUsers: 50,
    accessManagerEmail: '',
    accessManagerName: '',
    adminEmails: [''],
  });

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (data.success) {
        router.push('/dashboard/customers');
      } else {
        setError(data.error ?? 'Failed to create customer');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Customer</h1>

      {/* Step indicators */}
      <div className="flex items-center mb-8 gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                i === step ? 'bg-blue-800 text-white' : i < step ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
              }`}
            >
              {i < step ? '✓' : i + 1}
            </div>
            <span className={`text-sm ${i === step ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
              {label}
            </span>
            {i < STEPS.length - 1 && <div className="w-8 h-px bg-gray-200" />}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {step === 0 && (
          <div className="space-y-4">
            <Field label="Company Name *">
              <input className={inputCls} value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Acme Corp" />
            </Field>
            <Field label="Domain">
              <input className={inputCls} value={form.domain} onChange={(e) => update('domain', e.target.value)} placeholder="acme.com" />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <Field label="Plan">
              <select className={inputCls} value={form.plan} onChange={(e) => update('plan', e.target.value as FormData['plan'])}>
                <option value="starter">Starter</option>
                <option value="professional">Professional</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </Field>
            <Field label="Contract Duration (months)">
              <input type="number" className={inputCls} value={form.contractMonths} onChange={(e) => update('contractMonths', Number(e.target.value))} min={1} max={60} />
            </Field>
            <Field label="Max Users">
              <input type="number" className={inputCls} value={form.maxUsers} onChange={(e) => update('maxUsers', Number(e.target.value))} min={1} />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 mb-4">
              Access Manager is required. Up to 3 Admin accounts are optional.
            </p>
            <Field label="Access Manager Name *">
              <input className={inputCls} value={form.accessManagerName} onChange={(e) => update('accessManagerName', e.target.value)} />
            </Field>
            <Field label="Access Manager Email *">
              <input type="email" className={inputCls} value={form.accessManagerEmail} onChange={(e) => update('accessManagerEmail', e.target.value)} />
            </Field>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Admin Emails (optional)</label>
              {form.adminEmails.map((email, idx) => (
                <div key={idx} className="flex gap-2 mb-2">
                  <input
                    type="email"
                    className={inputCls}
                    value={email}
                    placeholder={`admin${idx + 1}@company.com`}
                    onChange={(e) => {
                      const emails = [...form.adminEmails];
                      emails[idx] = e.target.value;
                      update('adminEmails', emails);
                    }}
                  />
                  {form.adminEmails.length < 3 && idx === form.adminEmails.length - 1 && (
                    <button onClick={() => update('adminEmails', [...form.adminEmails, ''])} className="text-blue-600 text-sm whitespace-nowrap">+ Add</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3 text-sm">
            <h2 className="font-semibold text-gray-900">Confirm Details</h2>
            <Row label="Company" value={form.name} />
            <Row label="Plan" value={form.plan} />
            <Row label="Contract" value={`${form.contractMonths} months`} />
            <Row label="Max Users" value={String(form.maxUsers)} />
            <Row label="Access Manager" value={`${form.accessManagerName} <${form.accessManagerEmail}>`} />
            <Row label="Admins" value={form.adminEmails.filter(Boolean).join(', ') || '—'} />
            <p className="text-gray-500 text-xs mt-4">
              12-character passwords will be auto-generated and sent via invitation email. All recipients must change their password on first login.
            </p>
            {error && <p className="text-red-600">{error}</p>}
          </div>
        )}

        <div className="flex justify-between mt-6">
          <button
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-30"
          >
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={step === 0 && !form.name}
              className="px-4 py-2 text-sm bg-blue-800 text-white rounded-lg hover:bg-blue-900 disabled:opacity-50"
            >
              Next
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={loading || !form.accessManagerEmail}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Creating…' : 'Create Customer'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-gray-500 w-32 shrink-0">{label}</span>
      <span className="text-gray-900 font-medium">{value}</span>
    </div>
  );
}
