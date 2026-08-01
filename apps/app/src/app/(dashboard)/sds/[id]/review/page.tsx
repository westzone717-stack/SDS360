'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { SDS_SCHEMA, EMPTY_INGREDIENT } from '../sds-sections';
import type { SdsSectionsMap, SdsSectionData, SdsIngredient } from '../sds-sections';
import { PdfViewer } from './PdfViewer';

interface SdsDoc {
  _id: string;
  productName: string;
  supplier?: string;
  hazardLevel: string;
  reviewStatus: string;
  modelUsed: string;
  s3Key: string;
  sections: SdsSectionsMap;
  downloadUrl?: string;
}

const EMPTY_SECTION: SdsSectionData = { confidence: 0, fieldStatus: 'pending' };

function confidenceColor(c: number) {
  if (c >= 0.85) return 'text-green-600 bg-green-50 border-green-200';
  if (c >= 0.5) return 'text-amber-600 bg-amber-50 border-amber-200';
  return 'text-red-600 bg-red-50 border-red-200';
}

function confidenceLabel(c: number) {
  if (c >= 0.85) return 'Highly Confident';
  if (c >= 0.5) return 'Review suggested';
  return 'Review required';
}

export default function SdsReviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [doc, setDoc] = useState<SdsDoc | null>(null);
  const [sections, setSections] = useState<SdsSectionsMap>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/sds/${params.id}?download=1`)
      .then((r) => r.json())
      .then((d: { success: boolean; data?: SdsDoc }) => {
        if (d.success && d.data) {
          setDoc(d.data);
          setSections(d.data.sections ?? {});
        } else {
          setError('Failed to load SDS document.');
        }
        setLoading(false);
      });
  }, [params.id]);

  function getSection(key: string): SdsSectionData {
    return sections[key] ?? EMPTY_SECTION;
  }

  function updateSection(key: string, patch: Partial<SdsSectionData>) {
    setSections((prev) => ({ ...prev, [key]: { ...(prev[key] ?? EMPTY_SECTION), ...patch } }));
  }

  function approveSection(key: string) {
    updateSection(key, { fieldStatus: 'human_approved' });
  }

  function approveAll() {
    setSections((prev) => {
      const next = structuredClone(prev);
      for (const key of Object.keys(next)) next[key] = { ...next[key], fieldStatus: 'human_approved' };
      return next;
    });
  }

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function submitReview(approved: boolean) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sds/${params.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections, approved }),
      });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (data.success) {
        router.push('/sds');
      } else {
        setError(data.error ?? 'Review submission failed.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="text-center py-20 text-gray-400">Loading…</div>;
  if (error) return <div className="text-center py-20 text-red-500">{error}</div>;
  if (!doc) return null;

  const allSections = SDS_SCHEMA.map((s) => getSection(s.key));
  const allApproved = allSections.every((s) => s.fieldStatus === 'human_approved');
  const pdfUrl = doc.downloadUrl;

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)]">
      {/* Left: PDF Preview */}
      <div className="w-1/2 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <Link href={`/sds/${params.id}`} className="text-sm text-gray-400 hover:text-gray-600">
            ← Back to Detail
          </Link>
          <span className="text-xs text-gray-400">PDF Preview</span>
        </div>
        <div className="flex-1 bg-gray-100 rounded-xl border border-gray-200 overflow-hidden">
          {pdfUrl ? (
            <PdfViewer fileUrl={pdfUrl} />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              PDF preview unavailable
            </div>
          )}
        </div>
      </div>

      {/* Right: Section Review Panel */}
      <div className="w-1/2 flex flex-col">
        {/* Header */}
        <div className="mb-3">
          <h1 className="text-xl font-bold text-gray-900">{doc.productName}</h1>
          <div className="flex items-center gap-3 mt-1">
            {doc.supplier && <span className="text-xs text-gray-500">Supplier: {doc.supplier}</span>}
            <span className="text-xs text-gray-400">Model: {doc.modelUsed}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium capitalize">
              {doc.reviewStatus}
            </span>
          </div>
        </div>

        {/* Actions bar */}
        <div className="flex items-center gap-3 mb-3 p-3 bg-white rounded-lg border border-gray-200">
          <button
            onClick={approveAll}
            className="text-sm text-blue-700 border border-blue-300 px-3 py-1.5 rounded-lg hover:bg-blue-50"
          >
            Approve All Sections
          </button>
          <div className="flex-1" />
          <button
            onClick={() => submitReview(false)}
            disabled={submitting}
            className="text-sm text-gray-600 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Save Draft
          </button>
          <button
            onClick={() => submitReview(true)}
            disabled={submitting || !allApproved}
            className="text-sm bg-green-600 text-white px-4 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
            title={!allApproved ? 'All sections must be approved before submitting' : ''}
          >
            {submitting ? 'Submitting…' : 'Approve & Publish'}
          </button>
        </div>

        {/* Section list */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {SDS_SCHEMA.map((section) => {
            const data = getSection(section.key);
            const isExpanded = expanded.has(section.key);
            const isApproved = data.fieldStatus === 'human_approved';

            return (
              <div
                key={section.key}
                className={`bg-white rounded-xl border overflow-hidden ${
                  isApproved ? 'border-green-200' : data.confidence < 0.85 ? 'border-amber-200' : 'border-gray-200'
                }`}
              >
                <button
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
                  onClick={() => toggle(section.key)}
                >
                  <span className="text-sm text-gray-800 font-semibold w-52 shrink-0">{section.label}</span>
                  <span className="text-xs text-gray-400 truncate flex-1">
                    <SectionSummary section={section} data={data} />
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${confidenceColor(data.confidence)}`}>
                    {Math.round(data.confidence * 100)}%
                  </span>
                  {isApproved ? (
                    <span className="text-green-600 text-xs font-medium shrink-0">✓</span>
                  ) : (
                    <span className="text-gray-300 text-xs shrink-0">{isExpanded ? '▲' : '▼'}</span>
                  )}
                </button>

                {isExpanded && (
                  <div className="px-4 pb-3 pt-1 space-y-2">
                    {data.sourceLocation && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-xs text-amber-800">
                        <span className="font-medium">Source — Page {data.sourceLocation.page}:</span>{' '}
                        <span className="italic">{data.sourceLocation.excerpt}</span>
                      </div>
                    )}
                    <p className="text-xs text-gray-400">{confidenceLabel(data.confidence)}</p>

                    <SectionEditor section={section} data={data} onChange={(patch) => updateSection(section.key, patch)} />

                    <div className="flex justify-end">
                      <button
                        onClick={() => approveSection(section.key)}
                        className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors ${
                          isApproved
                            ? 'bg-green-100 text-green-700 border border-green-300'
                            : 'bg-white border border-gray-300 text-gray-600 hover:bg-green-50 hover:border-green-300 hover:text-green-700'
                        }`}
                      >
                        {isApproved ? '✓ Approved' : 'Approve Section'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SectionSummary({ section, data }: { section: (typeof SDS_SCHEMA)[number]; data: SdsSectionData }) {
  if (section.type === 'ingredients') {
    return <>{data.items?.length ? `${data.items.length} ingredient(s)` : <span className="italic text-gray-300">empty</span>}</>;
  }
  if (section.type === 'multi_select') {
    const labels = (data.values ?? []).map((v) => section.options?.find((o) => o.value === v)?.label ?? v);
    return <>{labels.length ? labels.join(', ') : <span className="italic text-gray-300">empty</span>}</>;
  }
  const opt = section.options?.find((o) => o.value === data.value);
  return <>{opt ? opt.label : <span className="italic text-gray-300">empty</span>}</>;
}

function SectionEditor({
  section,
  data,
  onChange,
}: {
  section: (typeof SDS_SCHEMA)[number];
  data: SdsSectionData;
  onChange: (patch: Partial<SdsSectionData>) => void;
}) {
  if (section.type === 'single_select') {
    return (
      <div className="flex flex-wrap gap-2">
        {section.options!.map((o) => (
          <label
            key={o.value}
            className={`text-xs px-3 py-1.5 rounded-lg border cursor-pointer ${
              data.value === o.value ? 'bg-blue-50 border-blue-400 text-blue-700' : 'border-gray-300 text-gray-600'
            }`}
          >
            <input type="radio" className="hidden" checked={data.value === o.value} onChange={() => onChange({ value: o.value })} />
            {o.label}
          </label>
        ))}
      </div>
    );
  }

  if (section.type === 'multi_select') {
    const values = data.values ?? [];
    return (
      <div className="flex flex-wrap gap-2">
        {section.options!.map((o) => {
          const checked = values.includes(o.value);
          return (
            <label
              key={o.value}
              className={`text-xs px-3 py-1.5 rounded-lg border cursor-pointer ${
                checked ? 'bg-blue-50 border-blue-400 text-blue-700' : 'border-gray-300 text-gray-600'
              }`}
              title={o.description}
            >
              <input
                type="checkbox"
                className="hidden"
                checked={checked}
                onChange={() => onChange({ values: checked ? values.filter((v) => v !== o.value) : [...values, o.value] })}
              />
              {o.label}
            </label>
          );
        })}
      </div>
    );
  }

  // ingredients
  const items = data.items ?? [];
  function updateItem(i: number, key: keyof SdsIngredient, value: string) {
    const next = items.slice();
    next[i] = { ...next[i], [key]: value };
    onChange({ items: next });
  }
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="border border-gray-200 rounded-lg p-2 grid grid-cols-3 gap-1.5">
          {(Object.keys(EMPTY_INGREDIENT) as Array<keyof SdsIngredient>).map((key) => (
            <input
              key={key}
              value={item[key]}
              onChange={(e) => updateItem(i, key, e.target.value)}
              placeholder={key}
              className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ))}
          <button
            onClick={() => onChange({ items: items.filter((_, idx) => idx !== i) })}
            className="col-span-3 text-xs text-red-600 hover:text-red-800 text-right"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange({ items: [...items, { ...EMPTY_INGREDIENT }] })}
        className="text-xs text-blue-700 border border-blue-300 rounded-lg px-3 py-1.5 hover:bg-blue-50"
      >
        + Add Ingredient
      </button>
    </div>
  );
}
