'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Question {
  _id: string;
  question: string;
  options: [string, string, string, string];
  difficulty: string;
}

interface SubmitResult {
  score: number;
  pass: boolean;
  correct: number;
  total: number;
  expiresAt?: string;
  answers: Array<{ questionId: string; correct: boolean; selectedIndex: number }>;
}

export default function QuizPage() {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState(30 * 60); // 30 minutes

  useEffect(() => {
    fetch('/api/training/quiz')
      .then((r) => r.json())
      .then((d: { success: boolean; data?: Question[]; error?: string }) => {
        if (d.success && d.data) setQuestions(d.data);
        else setError(d.error ?? 'Failed to load quiz');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (loading || result) return;
    const t = setInterval(() => {
      setTimeLeft((s) => {
        if (s <= 1) { clearInterval(t); submitAnswers(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [loading, result]);

  async function submitAnswers() {
    if (submitting || result) return;
    setSubmitting(true);
    const payload = questions.map((q) => ({
      questionId: q._id,
      selectedIndex: answers[q._id] ?? 0,
    }));
    const res = await fetch('/api/training/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: payload }),
    });
    const data = (await res.json()) as { success: boolean; data?: SubmitResult };
    if (data.success && data.data) setResult(data.data);
    setSubmitting(false);
  }

  if (loading) return <div className="text-center py-20 text-gray-400">Loading quiz…</div>;
  if (error) return <div className="text-center py-20 text-red-500">{error}</div>;

  if (result) {
    return (
      <div className="max-w-lg mx-auto text-center py-12">
        <div className={`text-6xl mb-4 ${result.pass ? '✅' : '❌'}`}>
          {result.pass ? '✅' : '❌'}
        </div>
        <h1 className={`text-3xl font-bold mb-2 ${result.pass ? 'text-green-700' : 'text-red-700'}`}>
          {result.pass ? 'Certified!' : 'Not Passed'}
        </h1>
        <p className="text-gray-600 mb-6">
          You scored <strong>{result.score}%</strong> ({result.correct}/{result.total} correct)
        </p>
        {result.pass && result.expiresAt && (
          <p className="text-sm text-gray-500 mb-8">
            Certification valid until {new Date(result.expiresAt).toLocaleDateString()}
          </p>
        )}
        {!result.pass && (
          <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3 mb-8">
            Minimum passing score is 80%. You can retake the training next time you log in.
          </p>
        )}
        <button
          onClick={() => router.push('/training')}
          className="bg-blue-800 text-white px-6 py-3 rounded-xl font-medium hover:bg-blue-900"
        >
          Back to Training
        </button>
      </div>
    );
  }

  const q = questions[current];
  const minutes = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const seconds = String(timeLeft % 60).padStart(2, '0');

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-gray-500">Question {current + 1} of {questions.length}</p>
          <div className="w-48 bg-gray-200 rounded-full h-1.5 mt-1">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all"
              style={{ width: `${((current + 1) / questions.length) * 100}%` }}
            />
          </div>
        </div>
        <div className={`text-sm font-mono font-bold px-3 py-1 rounded-lg ${timeLeft < 300 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
          {minutes}:{seconds}
        </div>
      </div>

      {/* Question card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-4">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize mb-3 inline-block ${
          q.difficulty === 'expert' ? 'bg-red-100 text-red-700' : q.difficulty === 'advanced' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
        }`}>{q.difficulty}</span>
        <p className="text-gray-900 font-medium text-base leading-relaxed mb-6">{q.question}</p>
        <div className="space-y-3">
          {q.options.map((opt, idx) => (
            <button
              key={idx}
              onClick={() => setAnswers((a) => ({ ...a, [q._id]: idx }))}
              className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm transition-colors ${
                answers[q._id] === idx
                  ? 'border-blue-600 bg-blue-50 text-blue-800 font-medium'
                  : 'border-gray-200 hover:border-gray-300 text-gray-700'
              }`}
            >
              <span className="font-mono mr-3 text-gray-400">{['A', 'B', 'C', 'D'][idx]}</span>
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={() => setCurrent((c) => c - 1)}
          disabled={current === 0}
          className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-30"
        >
          Previous
        </button>
        {current < questions.length - 1 ? (
          <button
            onClick={() => setCurrent((c) => c + 1)}
            className="px-4 py-2 text-sm bg-blue-800 text-white rounded-lg hover:bg-blue-900"
          >
            Next
          </button>
        ) : (
          <button
            onClick={submitAnswers}
            disabled={submitting}
            className="px-6 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Submit Quiz'}
          </button>
        )}
      </div>
    </div>
  );
}
