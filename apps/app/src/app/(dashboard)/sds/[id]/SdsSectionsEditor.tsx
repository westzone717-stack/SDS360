'use client';

import { useState } from 'react';
import { SDS_SCHEMA } from './sds-sections';
import type { SdsSectionsMap, SdsFieldData } from './sds-sections';

interface Props {
  docId: string;
  initialSections: SdsSectionsMap;
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

const EMPTY_FIELD: SdsFieldData = { content: '', confidence: 0, fieldStatus: 'pending' };

function fieldPath(sectionKey: string, subsectionKey: string, fieldKey: string) {
  return `${sectionKey}.${subsectionKey}.${fieldKey}`;
}

export function SdsSectionsEditor({ docId, initialSections, isAdmin }: Props) {
  const [sections, setSections] = useState<SdsSectionsMap>(initialSections);
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function getField(sectionKey: string, subsectionKey: string, fieldKey: string): SdsFieldData {
    return sections[sectionKey]?.subsections?.[subsectionKey]?.fields?.[fieldKey] ?? EMPTY_FIELD;
  }

  function toggleField(path: string) {
    setExpandedFields((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function startEdit(path: string, content: string) {
    setEditingPath(path);
    setEditValue(content);
    setSaveError(null);
  }

  function cancelEdit() {
    setEditingPath(null);
    setEditValue('');
    setSaveError(null);
  }

  async function saveEdit(sectionKey: string, subsectionKey: string, fieldKey: string) {
    setSaving(true);
    setSaveError(null);
    const res = await fetch(`/api/sds/${docId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sectionKey, subsectionKey, fieldKey, fieldContent: editValue }),
    });
    const data = (await res.json()) as { success: boolean; error?: string };
    setSaving(false);
    if (!data.success) {
      setSaveError(data.error ?? 'Save failed');
      return;
    }
    setSections((prev) => {
      const next = structuredClone(prev);
      next[sectionKey] ??= { subsections: {} };
      next[sectionKey].subsections[subsectionKey] ??= { fields: {} };
      next[sectionKey].subsections[subsectionKey].fields[fieldKey] = {
        content: editValue,
        confidence: 1,
        fieldStatus: 'human_approved',
      };
      return next;
    });
    setEditingPath(null);
    setEditValue('');
  }

  return (
    <div className="space-y-8">
      {SDS_SCHEMA.map((section) => {
        // Non-admins only see sections that have at least one field with content
        const sectionHasContent = section.subsections.some((sub) =>
          sub.fields.some((f) => getField(section.key, sub.key, f.key).content)
        );
        if (!isAdmin && !sectionHasContent) return null;

        return (
          <div key={section.key}>
            <h2 className="text-base font-bold text-gray-900 mb-3">{section.label}</h2>
            <div className="space-y-3">
              {section.subsections.map((sub) => {
                const subHasContent = sub.fields.some((f) => getField(section.key, sub.key, f.key).content);
                if (!isAdmin && !subHasContent) return null;

                return (
                  <div key={sub.key} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                      <h3 className="font-semibold text-gray-700 text-xs">{sub.label}</h3>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {sub.fields.map((f) => {
                        const path = fieldPath(section.key, sub.key, f.key);
                        const data = getField(section.key, sub.key, f.key);
                        const isExpanded = expandedFields.has(path);
                        const isEditing = editingPath === path;

                        if (!isAdmin && !data.content) return null;

                        return (
                          <div key={f.key}>
                            <button
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
                              onClick={() => toggleField(path)}
                            >
                              <span className="text-sm text-gray-800 font-medium w-56 shrink-0 truncate">{f.label}</span>
                              <span className="text-sm text-gray-500 truncate flex-1">
                                {data.content || <span className="text-gray-300 italic">No content extracted</span>}
                              </span>
                              {data.content && (
                                <span className={`text-xs font-medium shrink-0 ${confidenceCls(data.confidence)}`}>
                                  {Math.round(data.confidence * 100)}%
                                </span>
                              )}
                              {isAdmin && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${fieldStatusBadge[data.fieldStatus] ?? 'bg-gray-100 text-gray-500'}`}>
                                  {fieldStatusLabel[data.fieldStatus] ?? data.fieldStatus}
                                </span>
                              )}
                              <span className="text-gray-300 text-xs shrink-0">{isExpanded ? '▲' : '▼'}</span>
                            </button>

                            {isExpanded && (
                              <div className="px-4 pb-4 pt-1">
                                {isEditing ? (
                                  <div>
                                    <textarea
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      rows={Math.max(3, editValue.split('\n').length + 1)}
                                      className="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                                      autoFocus
                                    />
                                    {saveError && <p className="text-xs text-red-600 mt-1">{saveError}</p>}
                                    <div className="flex gap-2 justify-end mt-2">
                                      <button
                                        onClick={cancelEdit}
                                        disabled={saving}
                                        className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        onClick={() => saveEdit(section.key, sub.key, f.key)}
                                        disabled={saving}
                                        className="text-xs bg-blue-800 text-white px-3 py-1.5 rounded-lg hover:bg-blue-900 disabled:opacity-50 font-medium"
                                      >
                                        {saving ? 'Saving…' : 'Save'}
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-start justify-between gap-3">
                                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed flex-1">
                                      {data.content || <span className="text-gray-300 italic">No content extracted — click Edit to add manually</span>}
                                    </p>
                                    {isAdmin && (
                                      <button
                                        onClick={() => startEdit(path, data.content)}
                                        className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2.5 py-1 rounded-lg hover:bg-blue-50 border border-blue-200 transition-colors shrink-0"
                                      >
                                        Edit
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
