'use client';

import { useState } from 'react';

export interface TempCredential {
  email: string;
  role?: string;
  tempPassword: string;
  emailed: boolean;
}

/** Shows freshly issued temporary passwords once, with copy buttons. */
export default function TempPasswordCard({ credentials, loginUrl }: { credentials: TempCredential[]; loginUrl: string }) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      /* clipboard blocked — the text is still selectable */
    }
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
      <p className="font-semibold text-amber-900">Temporary passwords — shown only once</p>
      <p className="text-amber-800 text-xs mt-1 mb-3">
        Copy these now and hand them to each person securely. They log in at{' '}
        <span className="font-mono">{loginUrl}</span> and must set a new password on first login.
      </p>
      <div className="space-y-2">
        {credentials.map((c) => {
          const block = `Login: ${loginUrl}\nEmail: ${c.email}\nTemporary password: ${c.tempPassword}`;
          return (
            <div key={c.email} className="flex items-center gap-3 bg-white rounded-lg border border-amber-200 px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-gray-900 truncate">
                  {c.email}
                  {c.role && <span className="ml-2 text-xs text-gray-500 capitalize">{c.role.replace('_', ' ')}</span>}
                </p>
                <p className="font-mono text-base tracking-wide text-gray-900 select-all">{c.tempPassword}</p>
                {c.emailed && <p className="text-xs text-green-700">Also sent by email</p>}
              </div>
              <button
                type="button"
                onClick={() => copy(c.email, block)}
                className="shrink-0 px-2.5 py-1 rounded-md text-xs font-medium border border-gray-300 text-gray-700 hover:bg-gray-100"
              >
                {copied === c.email ? 'Copied' : 'Copy login info'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
