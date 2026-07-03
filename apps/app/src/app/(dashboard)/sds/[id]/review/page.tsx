'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

const SECTION_LABELS: Record<string, string> = {
  identification: '1. Identification',
  hazardIdentification: '2. Hazard(s) Identification',
  composition: '3. Composition / Ingredients',
  firstAidMeasures: '4. First-Aid Measures',
  fireFightingMeasures: '5. Fire-Fighting Measures',
  accidentalReleaseMeasures: '6. Accidental Release Measures',
  handlingAndStorage: '7. Handling and Storage',
  exposureControls: '8. Exposure Controls / Personal Protection',
  physicalAndChemicalProperties: '9. Physical & Chemical Properties',
  stabilityAndReactivity: '10. Stability and Reactivity',
  toxicologicalInformation: '11. Toxicological Information',
  ecologicalInformation: '12. Ecological Information',
  disposalConsiderations: '13. Disposal Considerations',
  transportInformation: '14. Transport Information',
  regulatoryInformation: '15. Regulatory Information',
  otherInformation: '16. Other Information',
};

interface SdsSection {
  content: string;
  confidence: number;
  fieldStatus: 'pending' | 'ai_approved' | 'human_approved';
  sourceLocation?: { page: number; excerpt: string };
}

interface SdsDoc {
  _id: string;
  productName: string;
  casNumber?: string;
  hazardLevel: string;
  reviewStatus: string;
  modelUsed: string;
  s3Key: string;
  sections: Record<string, SdsSection>;
  downloadUrl?: string;
}

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
  const [sections, setSections] = useState<Record<string, SdsSection>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/sds/${params.id}?download=1`)
      .then((r) => r.json())
      .then((d: { success: boolean; data?: SdsDoc }) => {
        if (d.success && d.data) {
          setDoc(d.data);
          const initial = d.data.sections ?? {};
          setSections(initial);
          // Auto-expand low-confidence sections
          const exp: Record<string, boolean> = {};
          for (const [key, sec] of Object.entries(initial)) {
            exp[key] = (sec as SdsSection).confidence < 0.85;
          }
          setExpanded(exp);
        } else {
          setError('Failed to load SDS document.');
        }
        setLoading(false);
      });
  }, [params.id]);

  function updateSection(key: string, field: Partial<SdsSection>) {
    setSections((prev) => ({ ...prev, [key]: { ...prev[key], ...field } }));
  }

  function approveField(key: string) {
    updateSection(key, { fieldStatus: 'human_approved' });
  }

  function approveAll() {
    setSections((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        next[key] = { ...next[key], fieldStatus: 'human_approved' };
      }
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

  const allApproved = Object.values(sections).every((s) => s.fieldStatus === 'human_approved');
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
            <iframe
              src={pdfUrl}
              className="w-full h-full"
              title="SDS Document PDF"
            />
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
            {doc.casNumber && (
              <span className="text-xs text-gray-500 font-mono">CAS: {doc.casNumber}</span>
            )}
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

        {/* Fields */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {Object.entries(SECTION_LABELS).map(([key, label]) => {
            const sec = sections[key];
            if (!sec) return null;
            const isExpanded = expanded[key];
            const needsReview = sec.confidence < 0.85;

            return (
              <div
                key={key}
                className={`bg-white rounded-xl border overflow-hidden ${
                  sec.fieldStatus === 'human_approved'
                    ? 'border-green-200'
                    : needsReview
                    ? 'border-amber-200'
                    : 'border-gray-200'
                }`}
              >
                {/* Section header */}
                <button
                  className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  onClick={() => setExpanded((e) => ({ ...e, [key]: !e[key] }))}
                >
                  <span className="text-xs font-semibold text-gray-700 flex-1">{label}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${confidenceColor(sec.confidence)}`}>
                    {Math.round(sec.confidence * 100)}% · {confidenceLabel(sec.confidence)}
                  </span>
                  {sec.fieldStatus === 'human_approved' ? (
                    <span className="text-green-600 text-xs font-medium">✓ Approved</span>
                  ) : (
                    <span className="text-gray-300 text-xs">▼</span>
                  )}
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
                    {/* Source location */}
                    {sec.sourceLocation && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                        <span className="font-medium">Source — Page {sec.sourceLocation.page}:</span>{' '}
                        <span className="italic">{sec.sourceLocation.excerpt}</span>
                      </div>
                    )}

                    {/* Editable content */}
                    <textarea
                      value={sec.content}
                      onChange={(e) => updateSection(key, { content: e.target.value })}
                      rows={4}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                    />

                    {/* Approve field button */}
                    <div className="flex justify-end">
                      <button
                        onClick={() => approveField(key)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                          sec.fieldStatus === 'human_approved'
                            ? 'bg-green-100 text-green-700 border border-green-300'
                            : 'bg-white border border-gray-300 text-gray-600 hover:bg-green-50 hover:border-green-300 hover:text-green-700'
                        }`}
                      >
                        {sec.fieldStatus === 'human_approved' ? '✓ Approved' : 'Approve Field'}
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
