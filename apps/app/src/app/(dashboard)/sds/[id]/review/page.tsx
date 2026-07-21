'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { SDS_SCHEMA } from '../sds-sections';
import type { SdsSectionsMap, SdsFieldData } from '../sds-sections';
import { PdfViewer } from './PdfViewer';

interface SdsDoc {
  _id: string;
  productName: string;
  casNumber?: string;
  hazardLevel: string;
  reviewStatus: string;
  modelUsed: string;
  s3Key: string;
  sections: SdsSectionsMap;
  downloadUrl?: string;
}

const EMPTY_FIELD: SdsFieldData = { content: '', confidence: 0, fieldStatus: 'pending' };

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

function fieldPath(sectionKey: string, subsectionKey: string, fieldKey: string) {
  return `${sectionKey}.${subsectionKey}.${fieldKey}`;
}

export default function SdsReviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [doc, setDoc] = useState<SdsDoc | null>(null);
  const [sections, setSections] = useState<SdsSectionsMap>({});
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());
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

  function getField(sectionKey: string, subsectionKey: string, fieldKey: string): SdsFieldData {
    return sections[sectionKey]?.subsections?.[subsectionKey]?.fields?.[fieldKey] ?? EMPTY_FIELD;
  }

  function updateField(sectionKey: string, subsectionKey: string, fieldKey: string, patch: Partial<SdsFieldData>) {
    setSections((prev) => {
      const next = structuredClone(prev);
      next[sectionKey] ??= { subsections: {} };
      next[sectionKey].subsections[subsectionKey] ??= { fields: {} };
      const current = next[sectionKey].subsections[subsectionKey].fields[fieldKey] ?? EMPTY_FIELD;
      next[sectionKey].subsections[subsectionKey].fields[fieldKey] = { ...current, ...patch };
      return next;
    });
  }

  function approveField(sectionKey: string, subsectionKey: string, fieldKey: string) {
    updateField(sectionKey, subsectionKey, fieldKey, { fieldStatus: 'human_approved' });
  }

  function approveAll() {
    setSections((prev) => {
      const next = structuredClone(prev);
      for (const section of Object.values(next)) {
        for (const sub of Object.values(section.subsections)) {
          for (const key of Object.keys(sub.fields)) {
            sub.fields[key] = { ...sub.fields[key], fieldStatus: 'human_approved' };
          }
        }
      }
      return next;
    });
  }

  function toggleField(path: string) {
    setExpandedFields((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
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

  const allFields = SDS_SCHEMA.flatMap((section) =>
    section.subsections.flatMap((sub) => sub.fields.map((f) => getField(section.key, sub.key, f.key)))
  );
  const allApproved = allFields.every((f) => f.fieldStatus === 'human_approved');
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

      {/* Right: Field Review Panel */}
      <div className="w-1/2 flex flex-col">
        {/* Header */}
        <div className="mb-3">
          <h1 className="text-xl font-bold text-gray-900">{doc.productName}</h1>
          <div className="flex items-center gap-3 mt-1">
            {doc.casNumber && <span className="text-xs text-gray-500 font-mono">CAS: {doc.casNumber}</span>}
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
            Approve All Fields
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
            title={!allApproved ? 'All fields must be approved before submitting' : ''}
          >
            {submitting ? 'Submitting…' : 'Approve & Publish'}
          </button>
        </div>

        {/* Field tree: sections + subsections expanded, fields collapsed */}
        <div className="flex-1 overflow-y-auto space-y-6">
          {SDS_SCHEMA.map((section) => (
            <div key={section.key}>
              <h2 className="text-sm font-bold text-gray-900 mb-2">{section.label}</h2>
              <div className="space-y-2">
                {section.subsections.map((sub) => {
                  const subFields = sub.fields.map((f) => ({ f, data: getField(section.key, sub.key, f.key) }));
                  const needsReview = subFields.some(({ data }) => data.confidence < 0.85 && data.content);
                  const allSubApproved = subFields.every(({ data }) => data.fieldStatus === 'human_approved');

                  return (
                    <div
                      key={sub.key}
                      className={`bg-white rounded-xl border overflow-hidden ${
                        allSubApproved ? 'border-green-200' : needsReview ? 'border-amber-200' : 'border-gray-200'
                      }`}
                    >
                      <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                        <h3 className="text-xs font-semibold text-gray-700">{sub.label}</h3>
                        {allSubApproved && <span className="text-green-600 text-xs font-medium">✓ Approved</span>}
                      </div>
                      <div className="divide-y divide-gray-50">
                        {subFields.map(({ f, data }) => {
                          const path = fieldPath(section.key, sub.key, f.key);
                          const isExpanded = expandedFields.has(path);

                          return (
                            <div key={f.key}>
                              <button
                                className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-gray-50 transition-colors"
                                onClick={() => toggleField(path)}
                              >
                                <span className="text-xs text-gray-700 font-medium w-48 shrink-0 truncate">{f.label}</span>
                                <span className="text-xs text-gray-400 truncate flex-1">
                                  {data.content || <span className="italic text-gray-300">empty</span>}
                                </span>
                                {data.content && (
                                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${confidenceColor(data.confidence)}`}>
                                    {Math.round(data.confidence * 100)}%
                                  </span>
                                )}
                                {data.fieldStatus === 'human_approved' ? (
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
                                  <textarea
                                    value={data.content}
                                    onChange={(e) => updateField(section.key, sub.key, f.key, { content: e.target.value })}
                                    rows={3}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                                  />
                                  <div className="flex justify-end">
                                    <button
                                      onClick={() => approveField(section.key, sub.key, f.key)}
                                      className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors ${
                                        data.fieldStatus === 'human_approved'
                                          ? 'bg-green-100 text-green-700 border border-green-300'
                                          : 'bg-white border border-gray-300 text-gray-600 hover:bg-green-50 hover:border-green-300 hover:text-green-700'
                                      }`}
                                    >
                                      {data.fieldStatus === 'human_approved' ? '✓ Approved' : 'Approve Field'}
                                    </button>
                                  </div>
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
          ))}
        </div>
      </div>
    </div>
  );
}
