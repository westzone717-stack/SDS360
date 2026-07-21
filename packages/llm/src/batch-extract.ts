import { buildSdsPrompt, parseSdsResponse, SDS_SECTION_BATCHES } from './prompts';
import type { SdsSectionsMap } from '@sds360/types';

// All 16 sections fire as concurrent requests, each carrying the full
// document text — under real API contention a single call can straggle well
// past what it'd take in isolation, so this has headroom built in.
const SECTION_TIMEOUT_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

// One retry for a timed-out/errored section before giving up on it. This
// absorbs transient stragglers (rate-limit queuing, a single dropped
// connection) that are common when firing 16 concurrent LLM calls, without
// needing to re-run the other 15 sections that already succeeded.
async function callWithRetry(
  callOnce: (prompt: string) => Promise<string>,
  prompt: string,
  label: string,
): Promise<string> {
  try {
    return await withTimeout(callOnce(prompt), SECTION_TIMEOUT_MS, label);
  } catch (err) {
    console.warn(`[LLM] ${label} failed once, retrying:`, err instanceof Error ? err.message : err);
    return withTimeout(callOnce(prompt), SECTION_TIMEOUT_MS, label);
  }
}

// If more than half of the sections fail, this isn't "one bad section" — it's
// a systemic problem (bad/missing API key, provider outage, network down).
// In that case we must throw so routeWithFallback moves on to the next
// provider, instead of silently returning a "successful" result that's
// actually empty for most of the document.
const FAILURE_RATIO_THRESHOLD = 0.5;

/**
 * Extracts each of the 16 main SDS sections as an independent LLM call, run
 * in parallel via Promise.allSettled. A single section that times out or
 * throws does NOT fail the whole document — it falls back to an empty,
 * zero-confidence placeholder (which naturally routes to human review) while
 * every other section's real result is preserved. Without this, one bad
 * section would force `routeWithFallback` to discard 15 good sections and
 * retry the entire document on the next provider.
 */
export async function extractSectionsBatched(
  providerLabel: string,
  documentText: string,
  callOnce: (prompt: string) => Promise<string>,
): Promise<SdsSectionsMap> {
  const results = await Promise.allSettled(
    SDS_SECTION_BATCHES.map((batch) =>
      callWithRetry(callOnce, buildSdsPrompt(documentText, batch), `${providerLabel} section "${batch[0]}"`)
    )
  );

  const failedKeys: string[] = [];
  const merged: SdsSectionsMap = {};
  results.forEach((result, i) => {
    const batch = SDS_SECTION_BATCHES[i];
    if (result.status === 'fulfilled') {
      Object.assign(merged, parseSdsResponse(result.value, batch).sections);
    } else {
      failedKeys.push(batch[0]);
      console.error(`[LLM:${providerLabel}] section "${batch[0]}" failed:`, result.reason);
      // '{}' parses to an empty object; parseSdsResponse fills in every field
      // for this section with content="" / confidence=0, keeping the shape valid.
      Object.assign(merged, parseSdsResponse('{}', batch).sections);
    }
  });

  const failureRatio = failedKeys.length / SDS_SECTION_BATCHES.length;
  if (failureRatio > FAILURE_RATIO_THRESHOLD) {
    throw new Error(
      `${providerLabel} failed ${failedKeys.length}/${SDS_SECTION_BATCHES.length} sections (${failedKeys.join(', ')}) — treating as provider failure`
    );
  }

  return merged;
}
