'use client';

import { useState } from 'react';
import { SECTION_KEYS, SECTION_LABELS } from './sds-sections';
import type { SectionData } from './sds-sections';

export type { SectionData };

interface Props {
  docId: string;
  initialSections: SectionData[];
  isAdmin: boolean;
}

function confidenceCls(c: number) {
  return c >= 0.85 ? 'text-green-600' : c >= 0.5 ? 'text-amber-600' : 'text-red-600';
}

const fieldStatusBadge: Record<string, string> = {
  human_approved: 'bg-green-100 text-green-700',
  ai_approved: 'bg-blue-100 text-blue-700',
  pending: 'bg-amber-100 text-amber-700',
};

const fieldStatusLabel: Record<string, string> = {
  human_approved: 'Human Approved',
  ai_approved: 'AI Approved',
  pending: 'Pending',
};

export function SdsSectionsEditor({ docId, initialSections, isAdmin }: Props) {
  const [sections, setSections] = useState<SectionData[]>(initialSections);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function startEdit(key: string, content: string) {
    setEditingKey(key);
    setEditValue(content);
    setSaveError(null);
  }

  function cancelEdit() {
    setEditingKey(null);
    setEditValue('');
    setSaveError(null);
  }

  async function saveEdit(key: string) {
    setSaving(true);
    setSaveError(null);
    const res = await fetch(`/api/sds/${docId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sectionKey: key, sectionContent: editValue }),
    });
    const data = (await res.json()) as { success: boolean; error?: string };
    setSaving(false);
    if (!data.success) {
      setSaveError(data.error ?? 'Save failed');
      return;
    }
    setSections((prev) =>
      prev.map((s) =>
        s.key === key
          ? { ...s, content: editValue, fieldStatus: 'human_approved', confidence: 1 }
          : s,
      ),
    );
    setEditingKey(null);
    setEditValue('');
  }

  return (
    <div className="space-y-4">
      {SECTION_KEYS.map((key) => {
        const section = sections.find((s) => s.key === key);
        const content = section?.content ?? '';
        const confidence = section?.confidence ?? 0;
        const fieldStatus = section?.fieldStatus ?? 'pending';
        const isEditing = editingKey === key;

        // Non-admins only see sections that have content
        if (!isAdmin && !content) return null;

        return (
          <div key={key} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Section header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="font-semibold text-gray-800 text-sm">{SECTION_LABELS[key]}</h2>
              <div className="flex items-center gap-3">
                {content && (
                  <span className={`text-xs font-medium ${confidenceCls(confidence)}`}>
                    {Math.round(confidence * 100)}% confidence
                  </span>
                )}
                {isAdmin && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${fieldStatusBadge[fieldStatus] ?? 'bg-gray-100 text-gray-500'}`}>
                    {fieldStatusLabel[fieldStatus] ?? fieldStatus}
                  </span>
                )}
                {isAdmin && !isEditing && (
                  <button
                    onClick={() => startEdit(key, content)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2.5 py-1 rounded-lg hover:bg-blue-50 border border-blue-200 transition-colors"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>

            {/* Body */}
            {isEditing ? (
              <div className="px-5 py-4">
                <textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  rows={Math.max(6, editValue.split('\n').length + 2)}
                  className="w-full border border-blue-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono leading-relaxed resize-y"
                  autoFocus
                />
                {saveError && (
                  <p className="text-xs text-red-600 mt-1">{saveError}</p>
                )}
                <div className="flex gap-2 justify-end mt-3">
                  <button
                    onClick={cancelEdit}
                    disabled={saving}
                    className="text-sm px-4 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => saveEdit(key)}
                    disabled={saving}
                    className="text-sm bg-blue-800 text-white px-4 py-1.5 rounded-lg hover:bg-blue-900 disabled:opacity-50 font-medium"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-5 py-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {content || (
                  <span className="text-gray-300 italic">No content extracted — click Edit to add manually</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
