'use client';

import { useState } from 'react';
import { SDS_SCHEMA } from './sds-sections';
import type { SdsSectionsMap, SdsSectionData, SdsIngredient } from './sds-sections';
import { EMPTY_INGREDIENT } from '@sds360/types';

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

const EMPTY_SECTION: SdsSectionData = { confidence: 0, fieldStatus: 'pending' };

export function SdsSectionsEditor({ docId, initialSections, isAdmin }: Props) {
  const [sections, setSections] = useState<SdsSectionsMap>(initialSections);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editValues, setEditValues] = useState<string[]>([]);
  const [editItems, setEditItems] = useState<SdsIngredient[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function getSection(key: string): SdsSectionData {
    return sections[key] ?? EMPTY_SECTION;
  }

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function startEdit(key: string, data: SdsSectionData) {
    setEditingKey(key);
    setEditValue(data.value ?? '');
    setEditValues(data.values ?? []);
    setEditItems(data.items ?? []);
    setSaveError(null);
  }

  function cancelEdit() {
    setEditingKey(null);
    setSaveError(null);
  }

  async function saveEdit(sectionKey: string) {
    const section = SDS_SCHEMA.find((s) => s.key === sectionKey);
    if (!section) return;
    setSaving(true);
    setSaveError(null);
    const body: Record<string, unknown> = { sectionKey };
    if (section.type === 'ingredients') body.sectionItems = editItems;
    else if (section.type === 'multi_select') body.sectionValues = editValues;
    else body.sectionValue = editValue;

    const res = await fetch(`/api/sds/${docId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { success: boolean; error?: string };
    setSaving(false);
    if (!data.success) {
      setSaveError(data.error ?? 'Save failed');
      return;
    }
    setSections((prev) => ({
      ...prev,
      [sectionKey]: {
        ...(section.type === 'ingredients' ? { items: editItems } : section.type === 'multi_select' ? { values: editValues } : { value: editValue }),
        confidence: 1,
        fieldStatus: 'human_approved',
      },
    }));
    setEditingKey(null);
  }

  function sectionSummary(section: (typeof SDS_SCHEMA)[number], data: SdsSectionData): string {
    if (section.type === 'ingredients') return `${data.items?.length ?? 0} ingredient(s)`;
    if (section.type === 'multi_select') {
      const labels = (data.values ?? []).map((v) => section.options?.find((o) => o.value === v)?.label ?? v);
      return labels.join(', ');
    }
    return section.options?.find((o) => o.value === data.value)?.label ?? '';
  }

  return (
    <div className="space-y-3">
      {SDS_SCHEMA.map((section) => {
        const data = getSection(section.key);
        const summary = sectionSummary(section, data);
        if (!isAdmin && !summary) return null;
        const isExpanded = expanded.has(section.key);
        const isEditing = editingKey === section.key;

        return (
          <div key={section.key} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              onClick={() => toggle(section.key)}
            >
              <span className="text-sm text-gray-800 font-semibold w-56 shrink-0">{section.label}</span>
              <span className="text-sm text-gray-500 truncate flex-1">
                {summary || <span className="text-gray-300 italic">No content extracted</span>}
              </span>
              {summary && (
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
              <div className="px-4 pb-4 pt-1 border-t border-gray-50">
                {isEditing ? (
                  <div className="space-y-3">
                    {section.type === 'single_select' && (
                      <div className="flex flex-wrap gap-2">
                        {section.options!.map((o) => (
                          <label key={o.value} className={`text-xs px-3 py-1.5 rounded-lg border cursor-pointer ${editValue === o.value ? 'bg-blue-50 border-blue-400 text-blue-700' : 'border-gray-300 text-gray-600'}`}>
                            <input type="radio" className="hidden" checked={editValue === o.value} onChange={() => setEditValue(o.value)} />
                            {o.label}
                          </label>
                        ))}
                      </div>
                    )}
                    {section.type === 'multi_select' && (
                      <div className="flex flex-wrap gap-2">
                        {section.options!.map((o) => {
                          const checked = editValues.includes(o.value);
                          return (
                            <label key={o.value} className={`text-xs px-3 py-1.5 rounded-lg border cursor-pointer ${checked ? 'bg-blue-50 border-blue-400 text-blue-700' : 'border-gray-300 text-gray-600'}`} title={o.description}>
                              <input
                                type="checkbox"
                                className="hidden"
                                checked={checked}
                                onChange={() => setEditValues((prev) => checked ? prev.filter((v) => v !== o.value) : [...prev, o.value])}
                              />
                              {o.label}
                            </label>
                          );
                        })}
                      </div>
                    )}
                    {section.type === 'ingredients' && (
                      <IngredientsEditor items={editItems} onChange={setEditItems} />
                    )}
                    {saveError && <p className="text-xs text-red-600">{saveError}</p>}
                    <div className="flex gap-2 justify-end">
                      <button onClick={cancelEdit} disabled={saving} className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                        Cancel
                      </button>
                      <button onClick={() => saveEdit(section.key)} disabled={saving} className="text-xs bg-blue-800 text-white px-3 py-1.5 rounded-lg hover:bg-blue-900 disabled:opacity-50 font-medium">
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <SectionReadout section={section} data={data} />
                    {isAdmin && (
                      <button
                        onClick={() => startEdit(section.key, data)}
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
  );
}

function SectionReadout({ section, data }: { section: (typeof SDS_SCHEMA)[number]; data: SdsSectionData }) {
  if (section.type === 'ingredients') {
    if (!data.items || data.items.length === 0) {
      return <p className="text-sm text-gray-300 italic">No ingredients extracted</p>;
    }
    return (
      <div className="overflow-x-auto flex-1">
        <table className="text-xs w-full border-collapse">
          <thead>
            <tr className="text-left text-gray-400">
              {section.ingredientFields!.map((f) => (
                <th key={f.key} className="pr-3 pb-1 font-medium">{f.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, i) => (
              <tr key={i} className="border-t border-gray-50">
                {section.ingredientFields!.map((f) => (
                  <td key={f.key} className="pr-3 py-1 text-gray-700">{(item as unknown as Record<string, string>)[f.key] || '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (section.type === 'multi_select') {
    if (!data.values || data.values.length === 0) {
      return <p className="text-sm text-gray-300 italic">Nothing selected</p>;
    }
    return (
      <div className="flex flex-wrap gap-1.5 flex-1">
        {data.values.map((v) => {
          const opt = section.options!.find((o) => o.value === v);
          return (
            <span key={v} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full" title={opt?.description}>
              {opt?.label ?? v}
            </span>
          );
        })}
      </div>
    );
  }

  const opt = section.options!.find((o) => o.value === data.value);
  return <p className="text-sm text-gray-700 flex-1">{opt ? opt.label : <span className="text-gray-300 italic">Not set</span>}</p>;
}

function IngredientsEditor({ items, onChange }: { items: SdsIngredient[]; onChange: (items: SdsIngredient[]) => void }) {
  function updateCell(i: number, key: keyof SdsIngredient, value: string) {
    const next = items.slice();
    next[i] = { ...next[i], [key]: value };
    onChange(next);
  }
  function removeRow(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  function addRow() {
    onChange([...items, { ...EMPTY_INGREDIENT }]);
  }

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="border border-gray-200 rounded-lg p-3 grid grid-cols-3 gap-2">
          {(Object.keys(EMPTY_INGREDIENT) as Array<keyof SdsIngredient>).map((key) => (
            <input
              key={key}
              value={item[key]}
              onChange={(e) => updateCell(i, key, e.target.value)}
              placeholder={key}
              className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ))}
          <button onClick={() => removeRow(i)} className="col-span-3 text-xs text-red-600 hover:text-red-800 text-right">
            Remove ingredient
          </button>
        </div>
      ))}
      <button onClick={addRow} className="text-xs text-blue-700 border border-blue-300 rounded-lg px-3 py-1.5 hover:bg-blue-50">
        + Add Ingredient
      </button>
    </div>
  );
}
