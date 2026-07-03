'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

type UploadStatus = 'idle' | 'uploading' | 'processing' | 'ready' | 'error';

interface FileEntry {
  file: File;
  status: UploadStatus;
  error?: string;
  docId?: string;
}

const POLL_INTERVAL = 3000;
const POLL_TIMEOUT  = 5 * 60 * 1000; // 5 min max

export default function UploadSdsPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const pollTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // Clean up all timers on unmount
  useEffect(() => {
    return () => { pollTimers.current.forEach(clearInterval); };
  }, []);

  function addFiles(files: FileList | File[]) {
    const newEntries = Array.from(files).map((f) => ({ file: f, status: 'idle' as UploadStatus }));
    setEntries((prev) => [...prev, ...newEntries]);
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  }, []);

  function updateEntry(index: number, update: Partial<FileEntry>) {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, ...update } : e)));
  }

  function startPolling(docId: string, index: number) {
    const started = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - started > POLL_TIMEOUT) {
        clearInterval(timer);
        pollTimers.current.delete(docId);
        updateEntry(index, { status: 'error', error: 'Extraction timed out' });
        return;
      }
      try {
        const res = await fetch(`/api/sds/${docId}`);
        const data = (await res.json()) as { success: boolean; data?: { modelUsed?: string } };
        // modelUsed is set only after worker completes extraction (initially empty)
        if (data.success && data.data?.modelUsed) {
          clearInterval(timer);
          pollTimers.current.delete(docId);
          updateEntry(index, { status: 'ready' });
        }
      } catch {
        // Network hiccup — keep polling
      }
    }, POLL_INTERVAL);
    pollTimers.current.set(docId, timer);
  }

  async function computeHash(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async function uploadFile(entry: FileEntry, index: number) {
    updateEntry(index, { status: 'uploading' });
    try {
      // 1. Compute file hash for deduplication
      const contentHash = await computeHash(entry.file);

      // 2. Get upload URL (S3 presigned or local dev endpoint)
      const urlRes = await fetch('/api/sds/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: entry.file.name, contentType: entry.file.type, contentHash }),
      });
      const urlJson = (await urlRes.json()) as { success: boolean; error?: string; data?: { url: string; fields: Record<string, string>; docId: string } };
      if (!urlJson.success || !urlJson.data) throw new Error(urlJson.error ?? 'Failed to get upload URL');
      const { url, fields, docId } = urlJson.data;

      // 3. Upload file
      const form = new FormData();
      Object.entries(fields).forEach(([k, v]) => form.append(k, v));
      form.append('file', entry.file);
      const uploadRes = await fetch(url, { method: 'POST', body: form });
      if (!uploadRes.ok && uploadRes.status !== 204) {
        throw new Error(`Upload failed: ${uploadRes.status}`);
      }

      // 4. Trigger LLM extraction
      await fetch('/api/sds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docId }),
      });

      updateEntry(index, { status: 'processing', docId });

      // 5. Poll until extraction completes
      startPolling(docId, index);
    } catch (err) {
      updateEntry(index, { status: 'error', error: String(err) });
    }
  }

  async function uploadAll() {
    const pending = entries.filter((e) => e.status === 'idle');
    await Promise.all(pending.map((e) => uploadFile(e, entries.indexOf(e))));
  }

  const allDone = entries.length > 0 && entries.every((e) => e.status === 'ready' || e.status === 'error');
  const anyReady = entries.some((e) => e.status === 'ready');

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Upload SDS Documents</h1>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
          dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white'
        }`}
      >
        <p className="text-gray-500 text-sm">Drag & drop PDF / DOCX / PNG / JPG files here</p>
        <p className="text-gray-400 text-xs mt-1">Up to 50 files · Max 50 MB each</p>
        <label className="mt-4 inline-block cursor-pointer bg-blue-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-900">
          Browse Files
          <input
            type="file"
            className="hidden"
            multiple
            accept=".pdf,.docx,.png,.jpg,.jpeg"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
        </label>
      </div>

      {entries.length > 0 && (
        <div className="mt-6 space-y-2">
          {entries.map((entry, i) => (
            <div key={i} className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-3">
              <span className="flex-1 text-sm text-gray-800 truncate">{entry.file.name}</span>
              <span className="text-xs text-gray-400">{(entry.file.size / 1024 / 1024).toFixed(1)} MB</span>
              <StatusBadge status={entry.status} />
              {entry.status === 'error' && (
                <span className="text-xs text-red-600 truncate max-w-xs">{entry.error}</span>
              )}
            </div>
          ))}

          <div className="flex gap-3 pt-2 flex-wrap">
            <button
              onClick={uploadAll}
              disabled={entries.every((e) => e.status !== 'idle')}
              className="bg-blue-800 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-900 disabled:opacity-50"
            >
              Start Upload
            </button>
            {anyReady && (
              <button
                onClick={() => router.push('/sds')}
                className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
              >
                Go to SDS Library →
              </button>
            )}
            {!anyReady && (
              <button
                onClick={() => router.push('/sds')}
                className="text-gray-600 px-5 py-2 rounded-lg text-sm border border-gray-300 hover:bg-gray-50"
              >
                Done
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: UploadStatus }) {
  const map: Record<UploadStatus, { label: string; cls: string }> = {
    idle:       { label: 'Pending',           cls: 'text-gray-400 bg-gray-100' },
    uploading:  { label: 'Uploading…',        cls: 'text-blue-600 bg-blue-100' },
    processing: { label: 'AI Processing…',    cls: 'text-amber-600 bg-amber-100' },
    ready:      { label: '✓ Pending Review',  cls: 'text-green-700 bg-green-100' },
    error:      { label: 'Error',             cls: 'text-red-600 bg-red-100' },
  };
  const { label, cls } = map[status];
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>;
}
