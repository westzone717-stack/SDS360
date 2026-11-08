'use client';

// Section widgets shared by the review page and the detail-page editor.
// Each takes an optional onChange: without it, the widget renders read-only.

import { SDS_INGREDIENT_FIELDS, SDS_METADATA_FIELDS, EMPTY_INGREDIENT } from './sds-sections';
import type { SdsSelectOption, SdsIngredient, SdsMetadata } from './sds-sections';

// ─── Hazardous Ingredients: every value shown with its column label ───────────

export function IngredientsFields({
  items,
  onChange,
}: {
  items: SdsIngredient[];
  onChange: (items: SdsIngredient[]) => void;
}) {
  function updateCell(i: number, key: keyof SdsIngredient, value: string) {
    const next = items.slice();
    next[i] = { ...next[i], [key]: value };
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="border border-gray-200 rounded-lg p-3">
          <div className="grid grid-cols-3 gap-x-2 gap-y-2">
            {SDS_INGREDIENT_FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="block text-[11px] font-medium text-gray-500 mb-0.5 leading-tight">{f.label}</span>
                <input
                  value={item[f.key as keyof SdsIngredient] ?? ''}
                  onChange={(e) => updateCell(i, f.key as keyof SdsIngredient, e.target.value)}
                  placeholder="—"
                  className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
            ))}
          </div>
          <div className="text-right mt-2">
            <button
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              className="text-xs text-red-600 hover:text-red-800"
            >
              Remove ingredient
            </button>
          </div>
        </div>
      ))}
      <button
        onClick={() => onChange([...items, { ...EMPTY_INGREDIENT }])}
        className="text-xs text-blue-700 border border-blue-300 rounded-lg px-3 py-1.5 hover:bg-blue-50"
      >
        + Add Ingredient
      </button>
    </div>
  );
}

// ─── Label Color: one row per color with its swatch and meaning ──────────────

const SWATCH: Record<string, string> = {
  white: 'bg-white border-gray-300',
  green: 'bg-green-500 border-green-600',
  yellow: 'bg-yellow-300 border-yellow-400',
  orange: 'bg-orange-500 border-orange-600',
  red: 'bg-red-600 border-red-700',
};

export function LabelColorTable({
  options,
  value,
  onChange,
}: {
  options: SdsSelectOption[];
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
      <tbody className="divide-y divide-gray-200">
        {options.map((o) => {
          const selected = value === o.value;
          const [level, ...rest] = (o.description ?? '').split(' — ');
          return (
            <tr
              key={o.value}
              onClick={onChange ? () => onChange(o.value) : undefined}
              className={`${selected ? 'bg-blue-50' : ''} ${onChange ? 'cursor-pointer hover:bg-gray-50' : ''}`}
            >
              <td className="w-8 px-2 py-2 text-center">
                {onChange ? (
                  <input type="radio" checked={selected} onChange={() => onChange(o.value)} aria-label={o.label} />
                ) : (
                  selected && <span className="text-blue-600 font-bold">✓</span>
                )}
              </td>
              <td className="w-28 px-2 py-2">
                <span className="inline-flex items-center gap-2 font-medium text-gray-800">
                  <span className={`inline-block w-3.5 h-3.5 rounded-full border ${SWATCH[o.value] ?? 'bg-gray-200'}`} />
                  {o.label}
                </span>
              </td>
              <td className="w-32 px-2 py-2 font-medium text-gray-700">{level}</td>
              <td className="px-2 py-2 text-gray-600">{rest.join(' — ')}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Checklist table (PPE): check, item, guidance ────────────────────────────

export function ChecklistTable({
  options,
  values,
  onChange,
}: {
  options: SdsSelectOption[];
  values: string[];
  onChange?: (values: string[]) => void;
}) {
  function toggle(v: string) {
    if (!onChange) return;
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  }
  return (
    <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
      <tbody className="divide-y divide-gray-200">
        {options.map((o) => {
          const checked = values.includes(o.value);
          return (
            <tr
              key={o.value}
              onClick={onChange ? () => toggle(o.value) : undefined}
              className={`${checked ? 'bg-blue-50' : ''} ${onChange ? 'cursor-pointer hover:bg-gray-50' : ''}`}
            >
              <td className="w-10 px-2 py-2 text-center">
                <span
                  className={`inline-flex items-center justify-center w-5 h-5 rounded-full border text-[11px] ${
                    checked ? 'bg-purple-600 border-purple-600 text-white' : 'border-gray-300 text-transparent'
                  }`}
                  aria-label={checked ? 'Selected' : 'Not selected'}
                >
                  ✓
                </span>
              </td>
              <td className="w-48 px-2 py-2 font-medium text-gray-800 border-l border-gray-200">{o.label}</td>
              <td className="px-2 py-2 text-gray-600 border-l border-gray-200 whitespace-pre-line">
                {(o.description ?? '').replace(/\. (?=Must )/, '.\n')}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Document details (metadata) ─────────────────────────────────────────────

const METADATA_HINTS: Partial<Record<keyof SdsMetadata, string>> = {
  quantity: "Based on the company's inventory",
  reviewDate: 'e.g. 2026-05-01',
};

export function MetadataFields({
  metadata,
  onChange,
}: {
  metadata: SdsMetadata;
  onChange?: (metadata: SdsMetadata) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
      {SDS_METADATA_FIELDS.map((f) => {
        const key = f.key as keyof SdsMetadata;
        return (
          <label key={f.key} className="block">
            <span className="block text-[11px] font-medium text-gray-500 mb-0.5">{f.label}</span>
            {onChange ? (
              <input
                value={metadata[key] ?? ''}
                onChange={(e) => onChange({ ...metadata, [key]: e.target.value })}
                placeholder={METADATA_HINTS[key] ?? '—'}
                className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ) : (
              <span className="block text-sm text-gray-800">{metadata[key] || <span className="text-gray-300">—</span>}</span>
            )}
          </label>
        );
      })}
    </div>
  );
}
