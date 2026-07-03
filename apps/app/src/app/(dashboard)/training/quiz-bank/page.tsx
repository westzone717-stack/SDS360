'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';

type QuestionStatus = 'ai_generated' | 'under_review' | 'force_review' | 'approved' | 'rejected';
type Difficulty = 'basic' | 'advanced' | 'expert';

interface QuizQuestion {
  _id: string;
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
  difficulty: Difficulty;
  relatedSection: string;
  modelUsed: string;
  status: QuestionStatus;
  sdsDocumentId: string;
  createdAt: string;
}

interface SdsSummary {
  _id: string;
  productName: string;
  total: number;
  approved: number;
  ai_generated: number;
  under_review: number;
  force_review: number;
  rejected: number;
}

interface GenState {
  count: number;
  generating: boolean;
  result: { ok: boolean; msg: string } | null;
}

const STATUS_LABELS: Record<QuestionStatus, { label: string; cls: string }> = {
  ai_generated: { label: 'AI Generated', cls: 'bg-blue-100 text-blue-700' },
  under_review: { label: 'Under Review', cls: 'bg-amber-100 text-amber-700' },
  force_review: { label: 'Force Review', cls: 'bg-orange-100 text-orange-700' },
  approved: { label: 'Approved', cls: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-700' },
};

const DIFFICULTY_CLS: Record<Difficulty, string> = {
  basic: 'bg-green-100 text-green-700',
  advanced: 'bg-amber-100 text-amber-700',
  expert: 'bg-red-100 text-red-700',
};

const ANSWER_LETTERS = ['A', 'B', 'C', 'D'];
const PAGE_SIZE = 10;
const MAX_QUESTIONS = 25;

export default function QuizBankPage() {
  const [summaries, setSummaries] = useState<SdsSummary[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Expanded SDS + its questions
  const [expandedSdsId, setExpandedSdsId] = useState<string | null>(null);
  const [expandedQuestions, setExpandedQuestions] = useState<QuizQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);

  // Approve/reject
  const [actioning, setActioning] = useState<string | null>(null);
  const [bulkApproving, setBulkApproving] = useState<string | null>(null);

  // Inline generation state per SDS
  const [genStates, setGenStates] = useState<Record<string, GenState>>({});
  // Tracks IDs of questions created in the current session (for "New" badge)
  const [newQuestionIds, setNewQuestionIds] = useState<Set<string>>(new Set());

  // Polling: one interval per SDS doc (keyed by sdsId)
  const pollingRefs = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  // Ref mirror of expandedSdsId so poll callbacks can read current value
  const expandedSdsIdRef = useRef<string | null>(null);

  const loadSummaries = useCallback(async () => {
    setSummaryLoading(true);
    const res = await fetch('/api/quiz-questions/summary');
    const data = (await res.json()) as { success: boolean; data?: SdsSummary[] };
    if (data.success && data.data) setSummaries(data.data);
    setSummaryLoading(false);
  }, []);

  useEffect(() => { loadSummaries(); }, [loadSummaries]);

  // Keep expandedSdsIdRef in sync so polling closures always see the current value
  useEffect(() => { expandedSdsIdRef.current = expandedSdsId; }, [expandedSdsId]);

  // Cleanup all polling intervals on unmount
  useEffect(() => {
    const refs = pollingRefs.current;
    return () => { refs.forEach(clearInterval); };
  }, []);

  const loadQuestionsForSds = useCallback(async (sdsDocumentId: string): Promise<QuizQuestion[]> => {
    setQuestionsLoading(true);
    const res = await fetch(`/api/quiz-questions?sdsDocumentId=${sdsDocumentId}`);
    const data = (await res.json()) as { success: boolean; data?: QuizQuestion[] };
    const qs = data.success && data.data ? data.data : [];
    setExpandedQuestions(qs);
    setQuestionsLoading(false);
    return qs;
  }, []);

  async function toggleSds(id: string) {
    if (expandedSdsId === id) {
      setExpandedSdsId(null);
      setExpandedQuestions([]);
      setExpandedQuestionId(null);
      setNewQuestionIds(new Set());
    } else {
      setExpandedSdsId(id);
      setExpandedQuestionId(null);
      setNewQuestionIds(new Set());
      await loadQuestionsForSds(id);
    }
  }

  async function actionQuestion(id: string, act: 'approve' | 'reject') {
    setActioning(id);
    await fetch(`/api/quiz-questions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: act }),
    });
    setActioning(null);
    if (expandedSdsId) await loadQuestionsForSds(expandedSdsId);
    loadSummaries();
  }

  async function bulkApprove(sdsDocumentId: string) {
    setBulkApproving(sdsDocumentId);
    await fetch('/api/quiz-questions/bulk-approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sdsDocumentId }),
    });
    setBulkApproving(null);
    if (expandedSdsId === sdsDocumentId) await loadQuestionsForSds(sdsDocumentId);
    loadSummaries();
  }

  // Silent fetch — no loading spinner; used for polling
  async function silentFetchQuestions(sdsDocumentId: string): Promise<QuizQuestion[]> {
    const res = await fetch(`/api/quiz-questions?sdsDocumentId=${sdsDocumentId}`);
    const data = (await res.json()) as { success: boolean; data?: QuizQuestion[] };
    return data.success && data.data ? data.data : [];
  }

  function stopPolling(sdsId: string) {
    const iv = pollingRefs.current.get(sdsId);
    if (iv !== undefined) { clearInterval(iv); pollingRefs.current.delete(sdsId); }
  }

  function setGenCount(sdsId: string, count: number) {
    setGenStates((prev) => ({
      ...prev,
      [sdsId]: { ...prev[sdsId] ?? { generating: false, result: null }, count },
    }));
  }

  async function generateMore(sdsId: string) {
    const count = genStates[sdsId]?.count ?? 5;
    // Snapshot the IDs that exist right now — anything new after this is "just generated"
    const prevIds = new Set(expandedQuestions.map((q) => q._id));

    stopPolling(sdsId); // cancel any previous poll for this doc

    setGenStates((prev) => ({
      ...prev,
      [sdsId]: { count, generating: true, result: null },
    }));

    const res = await fetch('/api/quiz-questions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sdsDocumentId: sdsId, count }),
    });
    const data = (await res.json()) as { success: boolean; error?: string };

    setGenStates((prev) => ({
      ...prev,
      [sdsId]: {
        count,
        generating: false,
        result: {
          ok: data.success,
          msg: data.success
            ? 'Queued — polling for new questions…'
            : (data.error ?? 'Failed to queue generation.'),
        },
      },
    }));

    if (!data.success) return;

    // Poll every 3 s until new questions appear or we time out (90 s)
    const deadline = Date.now() + 90_000;
    const iv = setInterval(async () => {
      if (Date.now() > deadline) {
        stopPolling(sdsId);
        setGenStates((prev) => ({
          ...prev,
          [sdsId]: { ...prev[sdsId], result: { ok: false, msg: 'Timed out — refresh manually.' } },
        }));
        return;
      }

      const qs = await silentFetchQuestions(sdsId);
      const newIds = new Set(qs.filter((q) => !prevIds.has(q._id)).map((q) => q._id));
      if (newIds.size === 0) return; // nothing new yet, keep polling

      stopPolling(sdsId);

      // Update the open question list only if this SDS is still expanded
      if (expandedSdsIdRef.current === sdsId) {
        setExpandedQuestions(qs);
        setNewQuestionIds(newIds);
      }

      // Update the summary row for this SDS without reloading everything
      setSummaries((prev) =>
        prev.map((s) => {
          if (s._id !== sdsId) return s;
          return {
            ...s,
            total: qs.length,
            approved:     qs.filter((q) => q.status === 'approved').length,
            ai_generated: qs.filter((q) => q.status === 'ai_generated').length,
            under_review: qs.filter((q) => q.status === 'under_review').length,
            force_review: qs.filter((q) => q.status === 'force_review').length,
            rejected:     qs.filter((q) => q.status === 'rejected').length,
          };
        }),
      );

      setGenStates((prev) => ({
        ...prev,
        [sdsId]: {
          ...prev[sdsId],
          result: { ok: true, msg: `${newIds.size} new question${newIds.size > 1 ? 's' : ''} generated.` },
        },
      }));
    }, 3000);

    pollingRefs.current.set(sdsId, iv);
  }

  const filtered = summaries.filter(
    (s) => !search || s.productName.toLowerCase().includes(search.toLowerCase()),
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <Link href="/training" className="text-sm text-gray-400 hover:text-gray-600 mb-1 block">
          ← Training
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Quiz Bank</h1>
        <p className="text-sm text-gray-500 mt-0.5">{summaries.length} SDS documents</p>
      </div>

      <input
        type="text"
        placeholder="Search SDS documents…"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {summaryLoading ? (
        <div className="text-center py-20 text-gray-400">Loading…</div>
      ) : (
        <>
          <div className="space-y-2">
            {paginated.map((sds) => {
              const isExpanded = expandedSdsId === sds._id;
              const nonRejected = sds.approved + sds.ai_generated + sds.under_review + sds.force_review;
              const pendingCount = sds.ai_generated + sds.under_review;
              const hasApprovable = pendingCount > 0;
              const atMax = nonRejected >= MAX_QUESTIONS;
              const remaining = MAX_QUESTIONS - nonRejected;
              const gs = genStates[sds._id];
              const defaultCount = Math.min(5, remaining);

              return (
                <div key={sds._id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Row header */}
                  <div className="flex items-center gap-3 px-5 py-4">
                    <button
                      className="flex-1 flex items-center gap-3 text-left min-w-0"
                      onClick={() => toggleSds(sds._id)}
                    >
                      <span className="text-sm font-medium text-gray-900 flex-1 truncate">
                        {sds.productName}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {nonRejected === 0 ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">
                            No quizzes
                          </span>
                        ) : (
                          <>
                            {sds.approved > 0 && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                                {sds.approved} approved
                              </span>
                            )}
                            {sds.force_review > 0 && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                                {sds.force_review} review
                              </span>
                            )}
                            {pendingCount > 0 && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                                {pendingCount} pending
                              </span>
                            )}
                          </>
                        )}
                        <span className="text-xs text-gray-400">{nonRejected}/{MAX_QUESTIONS}</span>
                      </div>
                      <span className="text-gray-300 text-xs shrink-0">{isExpanded ? '▲' : '▼'}</span>
                    </button>

                    {hasApprovable && (
                      <button
                        onClick={(e) => { e.stopPropagation(); bulkApprove(sds._id); }}
                        disabled={bulkApproving === sds._id}
                        className="shrink-0 text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
                      >
                        {bulkApproving === sds._id ? 'Approving…' : 'Approve All'}
                      </button>
                    )}
                  </div>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="border-t border-gray-100">
                      {questionsLoading ? (
                        <div className="py-8 text-center text-gray-400 text-sm">Loading questions…</div>
                      ) : expandedQuestions.length === 0 ? (
                        <div className="py-6 text-center text-gray-400 text-sm">No questions yet.</div>
                      ) : (
                        <div className="divide-y divide-gray-50">
                          {expandedQuestions.map((q) => {
                            const isQExpanded = expandedQuestionId === q._id;
                            const needsAction = ['ai_generated', 'under_review', 'force_review'].includes(q.status);
                            const isNew = newQuestionIds.has(q._id);

                            return (
                              <div key={q._id} className="px-5 py-3">
                                <button
                                  className="w-full flex items-start gap-2 text-left"
                                  onClick={() => setExpandedQuestionId(isQExpanded ? null : q._id)}
                                >
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-gray-800 leading-snug">{q.question}</p>
                                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                      {isNew && (
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-semibold">
                                          New
                                        </span>
                                      )}
                                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_LABELS[q.status].cls}`}>
                                        {STATUS_LABELS[q.status].label}
                                      </span>
                                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${DIFFICULTY_CLS[q.difficulty]}`}>
                                        {q.difficulty}
                                      </span>
                                      <span className="text-xs text-gray-400 truncate">{q.relatedSection}</span>
                                    </div>
                                  </div>
                                  <span className="text-gray-300 text-xs mt-0.5 shrink-0">{isQExpanded ? '▲' : '▼'}</span>
                                </button>

                                {isQExpanded && (
                                  <div className="mt-3 space-y-3">
                                    <div className="space-y-1.5">
                                      {q.options.map((opt, idx) => (
                                        <div
                                          key={idx}
                                          className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm ${
                                            idx === q.correctIndex
                                              ? 'bg-green-50 border border-green-200 text-green-800'
                                              : 'bg-gray-50 text-gray-700'
                                          }`}
                                        >
                                          <span className={`font-mono font-bold text-xs mt-0.5 ${idx === q.correctIndex ? 'text-green-700' : 'text-gray-400'}`}>
                                            {ANSWER_LETTERS[idx]}
                                          </span>
                                          <span className="flex-1">{opt}</span>
                                          {idx === q.correctIndex && (
                                            <span className="text-xs text-green-600 font-medium">✓</span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                    <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 text-sm text-blue-800">
                                      <span className="font-medium">Explanation: </span>{q.explanation}
                                    </div>
                                    {needsAction && (
                                      <div className="flex gap-2 justify-end">
                                        <button
                                          onClick={() => actionQuestion(q._id, 'reject')}
                                          disabled={actioning === q._id}
                                          className="text-sm border border-red-300 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50"
                                        >
                                          Reject
                                        </button>
                                        <button
                                          onClick={() => actionQuestion(q._id, 'approve')}
                                          disabled={actioning === q._id || q.status === 'force_review'}
                                          className="text-sm bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
                                          title={q.status === 'force_review' ? 'Force-review questions must be individually reviewed' : ''}
                                        >
                                          {actioning === q._id ? 'Saving…' : 'Approve'}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Inline generate more */}
                      <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
                        {atMax ? (
                          <p className="text-xs text-gray-400 text-center">
                            Maximum {MAX_QUESTIONS} questions reached for this document.
                          </p>
                        ) : (
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-xs text-gray-500 font-medium">Generate more questions:</span>
                            <input
                              type="number"
                              min={1}
                              max={remaining}
                              value={gs?.count ?? defaultCount}
                              onChange={(e) =>
                                setGenCount(sds._id, Math.max(1, Math.min(remaining, Number(e.target.value))))
                              }
                              className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            />
                            <button
                              onClick={() => generateMore(sds._id)}
                              disabled={gs?.generating}
                              className="text-sm bg-blue-700 text-white px-4 py-1.5 rounded-lg hover:bg-blue-800 disabled:opacity-50 font-medium"
                            >
                              {gs?.generating ? 'Queuing…' : 'Generate'}
                            </button>
                            <span className="text-xs text-gray-400">{remaining} slots remaining</span>
                            {gs?.result && (
                              <span className={`text-xs ${gs.result.ok ? 'text-green-700' : 'text-red-600'}`}>
                                {gs.result.msg}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {paginated.length === 0 && (
              <div className="text-center py-16 text-gray-400 text-sm">
                {search ? 'No documents match your search.' : 'No approved SDS documents found.'}
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                ← Prev
              </button>
              <span className="text-sm text-gray-500">{currentPage} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
