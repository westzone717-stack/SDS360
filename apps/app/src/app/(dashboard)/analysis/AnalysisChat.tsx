'use client';

import { useEffect, useRef, useState } from 'react';
import { MarkdownLite } from './MarkdownLite';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  createdAt: string;
  // Only set on assistant messages — the actual AnalysisRun _id, used for the
  // download link. Distinct from `id` (a React key, which for restored
  // history messages carries a "-a"/"-u" suffix to stay unique per run).
  runId?: string;
  // Set when this assistant message is a clarifying question — renders the
  // candidates as clickable buttons instead of (or alongside) free-text input.
  needsClarification?: boolean;
  candidates?: string[];
}

interface HistoryItem {
  _id: string;
  request: string;
  report: string;
  status: 'completed' | 'failed';
  needsClarification?: boolean;
  candidates?: string[];
  createdAt: string;
}

const SUGGESTIONS = [
  'Summarize our SDS library and hazard level breakdown',
  'How is our training compliance looking this year?',
  'Give me an overview of the quiz bank health',
];

export function AnalysisChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  // The last request the user actually typed (not a candidate-button click) —
  // used as the base request when they resolve a clarification, so the
  // follow-up carries the original intent plus the chosen product name.
  const lastTypedRequestRef = useRef<string>('');

  useEffect(() => {
    fetch('/api/analysis')
      .then((r) => r.json())
      .then((d: { success: boolean; data?: HistoryItem[] }) => {
        if (d.success && d.data) {
          const restored: ChatMessage[] = d.data
            .slice()
            .reverse()
            .flatMap((run) => [
              { id: `${run._id}-u`, role: 'user' as const, content: run.request, createdAt: run.createdAt },
              {
                id: `${run._id}-a`,
                role: run.status === 'completed' ? ('assistant' as const) : ('error' as const),
                content: run.status === 'completed' ? run.report : 'This analysis failed to complete.',
                createdAt: run.createdAt,
                runId: run._id,
                needsClarification: run.needsClarification,
                candidates: run.candidates,
              },
            ]);
          setMessages(restored);
        }
        setLoadingHistory(false);
      });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // `displayText` is what shows up in the user's chat bubble; `requestText` is
  // what's actually sent to the API. They differ when resolving a
  // clarification: the bubble shows just the picked product name, but the
  // request sent combines it with the original question so the LLM has the
  // full context again (each /api/analysis/run call is stateless — there's no
  // server-side conversation memory, so this has to be assembled client-side).
  async function send(displayText: string, requestText?: string) {
    const trimmed = displayText.trim();
    if (!trimmed || loading) return;
    const toSend = (requestText ?? displayText).trim();
    if (!toSend) return;

    if (requestText === undefined) lastTypedRequestRef.current = trimmed;

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: trimmed, createdAt: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/analysis/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: toSend }),
      });
      const data = (await res.json()) as {
        success: boolean;
        error?: string;
        data?: { id: string; report: string; needsClarification?: boolean; candidates?: string[] };
      };

      if (data.success && data.data) {
        setMessages((prev) => [
          ...prev,
          {
            id: data.data!.id,
            role: 'assistant',
            content: data.data!.report,
            createdAt: new Date().toISOString(),
            runId: data.data!.id,
            needsClarification: data.data!.needsClarification,
            candidates: data.data!.candidates,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { id: `err-${Date.now()}`, role: 'error', content: data.error ?? 'Analysis failed.', createdAt: new Date().toISOString() },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: 'error', content: 'Network error — please try again.', createdAt: new Date().toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function answerClarification(candidate: string) {
    const base = lastTypedRequestRef.current || 'Give me a deeper analysis of this product';
    send(candidate, `${base} (Product: "${candidate}")`);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-3xl mx-auto">
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {loadingHistory ? (
          <div className="text-center text-gray-400 text-sm py-10">Loading history…</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400 text-sm mb-4">Ask a question about your organization's safety data.</p>
            <div className="flex flex-col items-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-sm text-blue-700 border border-blue-200 bg-blue-50 rounded-lg px-4 py-2 hover:bg-blue-100 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`rounded-xl px-4 py-3 max-w-[85%] ${
                  m.role === 'user'
                    ? 'bg-blue-800 text-white text-sm'
                    : m.role === 'error'
                    ? 'bg-red-50 border border-red-200 text-red-700 text-sm'
                    : 'bg-white border border-gray-200'
                }`}
              >
                {m.role === 'assistant' ? (
                  <>
                    <MarkdownLite text={m.content} />
                    {m.needsClarification && m.candidates?.length ? (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {m.candidates.map((c) => (
                          <button
                            key={c}
                            onClick={() => answerClarification(c)}
                            disabled={loading}
                            className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-3 py-1.5 hover:bg-blue-100 disabled:opacity-50 transition-colors"
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <a
                        href={`/api/analysis/${m.runId}/download`}
                        className="inline-block mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        ↓ Download report
                      </a>
                    )}
                  </>
                ) : (
                  m.content
                )}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-400">
              Planning steps, gathering data, and writing the report…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-gray-200 pt-3 flex gap-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask about SDS coverage, training compliance, quiz bank health…"
          rows={2}
          className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          className="bg-blue-800 text-white px-5 rounded-xl text-sm font-medium hover:bg-blue-900 disabled:opacity-50 shrink-0"
        >
          Send
        </button>
      </div>
    </div>
  );
}
