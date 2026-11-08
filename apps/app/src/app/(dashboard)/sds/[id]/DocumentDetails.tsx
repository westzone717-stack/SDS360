'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MetadataFields } from './section-widgets';
import type { SdsMetadata } from './sds-sections';

export function DocumentDetails({ docId, metadata, isAdmin }: { docId: string; metadata: SdsMetadata; isAdmin: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(metadata);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!draft.productName.trim()) {
      setError('Product name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/sds/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error ?? 'Save failed');
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-gray-800 font-semibold">Document Details</p>
        {isAdmin && !editing && (
          <button
            onClick={() => {
              setDraft(metadata);
              setEditing(true);
            }}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2.5 py-1 rounded-lg hover:bg-blue-50 border border-blue-200"
          >
            Edit
          </button>
        )}
      </div>
      <MetadataFields metadata={editing ? draft : metadata} onChange={editing ? setDraft : undefined} />
      {editing && (
        <div className="flex items-center justify-end gap-2 mt-3">
          {error && <span className="text-xs text-red-600">{error}</span>}
          <button
            onClick={() => setEditing(false)}
            disabled={saving}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="text-xs bg-blue-800 text-white px-3 py-1.5 rounded-lg hover:bg-blue-900 disabled:opacity-50 font-medium"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}
