import { buildSdsPrompt, parseSdsResponse } from './prompts';
import type { SdsExtractionResult } from './types';

// The schema is now small (6 sections, no 400-field tree), so the whole
// document fits comfortably in a single LLM call — no more per-section
// batching/timeout/retry machinery needed for that reason. A generous
// timeout plus one retry is still worth keeping for plain network flakiness.
const EXTRACTION_TIMEOUT_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

export async function extractSds(
  providerLabel: string,
  documentText: string,
  callOnce: (prompt: string) => Promise<string>,
): Promise<Pick<SdsExtractionResult, 'metadata' | 'sections'>> {
  const prompt = buildSdsPrompt(documentText);
  const label = `${providerLabel} SDS extraction`;

  let text: string;
  try {
    text = await withTimeout(callOnce(prompt), EXTRACTION_TIMEOUT_MS, label);
  } catch (err) {
    console.warn(`[LLM] ${label} failed once, retrying:`, err instanceof Error ? err.message : err);
    text = await withTimeout(callOnce(prompt), EXTRACTION_TIMEOUT_MS, label);
  }

  return parseSdsResponse(text);
}
