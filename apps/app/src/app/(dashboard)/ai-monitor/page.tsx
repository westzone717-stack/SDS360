'use client';

import { useEffect, useState, useCallback } from 'react';

type CircuitState = 'closed' | 'open' | 'half_open';

interface ProviderHealth {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  cooldownUntil?: string;
}

interface HealthData {
  claude: ProviderHealth;
  gpt: ProviderHealth;
  ollama: ProviderHealth;
}

interface DeadLetterItem {
  _id: string;
  taskType: 'sds_extraction' | 'quiz_generation';
  payload: Record<string, unknown>;
  failedAt: string;
  retryCount: number;
  lastError: string;
  resolvedAt?: string;
}

const STATE_STYLES: Record<CircuitState, { label: string; cls: string; dot: string }> = {
  closed: { label: 'Healthy', cls: 'bg-green-50 border-green-200', dot: 'bg-green-500' },
  open: { label: 'Tripped', cls: 'bg-red-50 border-red-200', dot: 'bg-red-500' },
  half_open: { label: 'Probing', cls: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
};

const PROVIDER_LABELS: Record<string, string> = {
  claude: 'Claude 4.6 Sonnet',
  gpt: 'GPT-5',
  ollama: 'Ollama Llama 3.1 70B',
};

const PROVIDER_ROLES: Record<string, string> = {
  claude: 'Primary (L1)',
  gpt: 'Backup (L2)',
  ollama: 'Fallback (L3)',
};

export default function AiMonitorPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [dlq, setDlq] = useState<DeadLetterItem[]>([]);
  const [loadingHealth, setLoadingHealth] = useState(true);
  const [loadingDlq, setLoadingDlq] = useState(true);
  const [resetting, setResetting] = useState<string | null>(null);

  const loadHealth = useCallback(() => {
    fetch('/api/llm/health')
      .then((r) => r.json())
      .then((d: { success: boolean; data?: HealthData }) => {
        if (d.success && d.data) setHealth(d.data);
        setLoadingHealth(false);
      });
  }, []);

  const loadDlq = useCallback(() => {
    fetch('/api/llm/dead-letter')
      .then((r) => r.json())
      .then((d: { success: boolean; data?: DeadLetterItem[] }) => {
        if (d.success && d.data) setDlq(d.data);
        setLoadingDlq(false);
      });
  }, []);

  useEffect(() => {
    loadHealth();
    loadDlq();
    const interval = setInterval(() => { loadHealth(); loadDlq(); }, 30_000);
    return () => clearInterval(interval);
  }, [loadHealth, loadDlq]);

  async function resetProvider(provider: string) {
    setResetting(provider);
    await fetch('/api/llm/health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, action: 'reset' }),
    });
    setResetting(null);
    loadHealth();
  }

  const unresolvedDlq = dlq.filter((d) => !d.resolvedAt);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Service Monitor</h1>
          <p className="text-sm text-gray-500 mt-0.5">LLM health status and failed task queue · refreshes every 30s</p>
        </div>
        <button
          onClick={() => { loadHealth(); loadDlq(); }}
          className="text-sm border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50"
        >
          Refresh Now
        </button>
      </div>

      {/* Provider health cards */}
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Circuit Breaker Status</h2>
      <div className="grid grid-cols-3 gap-4 mb-8">
        {(['claude', 'gpt', 'ollama'] as const).map((provider) => {
          const data = health?.[provider];
          const style = data ? STATE_STYLES[data.state] : STATE_STYLES.closed;
          return (
            <div key={provider} className={`bg-white rounded-xl border-2 p-5 ${style.cls}`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs text-gray-500 font-medium">{PROVIDER_ROLES[provider]}</p>
                  <p className="font-semibold text-gray-900">{PROVIDER_LABELS[provider]}</p>
                </div>
                <div className={`w-3 h-3 rounded-full ${style.dot}`} />
              </div>

              <div className="flex items-center gap-2 mb-4">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  data?.state === 'closed' ? 'bg-green-100 text-green-700' :
                  data?.state === 'open' ? 'bg-red-100 text-red-700' :
                  'bg-amber-100 text-amber-700'
                }`}>
                  {loadingHealth ? '…' : style.label}
                </span>
              </div>

              {data && (
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-4">
                  <div className="bg-white rounded-lg p-2 border border-gray-100">
                    <p className="text-gray-400">Failures</p>
                    <p className="text-lg font-bold text-red-600">{data.failureCount}</p>
                  </div>
                  <div className="bg-white rounded-lg p-2 border border-gray-100">
                    <p className="text-gray-400">Successes</p>
                    <p className="text-lg font-bold text-green-600">{data.successCount}</p>
                  </div>
                </div>
              )}

              {data?.cooldownUntil && new Date(data.cooldownUntil) > new Date() && (
                <p className="text-xs text-amber-700 mb-3">
                  Cooldown until {new Date(data.cooldownUntil).toLocaleTimeString()}
                </p>
              )}

              <button
                onClick={() => resetProvider(provider)}
                disabled={resetting === provider || data?.state === 'closed'}
                className="w-full text-xs border border-gray-300 text-gray-600 py-1.5 rounded-lg hover:bg-white disabled:opacity-40 transition-colors"
              >
                {resetting === provider ? 'Resetting…' : 'Reset Circuit'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Dead Letter Queue */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Dead Letter Queue
          {unresolvedDlq.length > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-bold">
              {unresolvedDlq.length}
            </span>
          )}
        </h2>
      </div>

      {loadingDlq ? (
        <div className="text-center py-10 text-gray-400 text-sm">Loading…</div>
      ) : unresolvedDlq.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center text-green-700 text-sm">
          No failed tasks in queue.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Task Type', 'Failed At', 'Retries', 'Error', 'Payload'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {unresolvedDlq.map((item) => (
                <tr key={item._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      item.taskType === 'sds_extraction' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                    }`}>
                      {item.taskType === 'sds_extraction' ? 'SDS Extract' : 'Quiz Gen'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(item.failedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-red-600 font-bold">{item.retryCount}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs max-w-xs truncate" title={item.lastError}>
                    {item.lastError}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs font-mono">
                    {JSON.stringify(item.payload).slice(0, 60)}…
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
