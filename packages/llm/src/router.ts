import { circuitBreaker } from './circuit-breaker';
import { callGroq } from './providers/groq';
import { callClaude } from './providers/claude';
import { callGpt } from './providers/gpt';
import { callOllama } from './providers/ollama';
import { callMock } from './providers/mock';
import { adjustConfidence } from './prompts';
import type { TaskType, LlmResult, ProviderConfig, SdsExtractionResult, QuizGenerationOptions } from './types';
import { AllProvidersFailedError } from './types';

// Must exceed the worst case inside extractSectionsBatched: a single section
// can take up to SECTION_TIMEOUT_MS (60s) plus one retry at the same timeout
// (another 60s) = 120s, even though all 16 sections run in parallel. This
// used to be 90s, which was tighter than that worst case — a single slow
// section could trip THIS outer timeout and mark an otherwise-healthy
// provider as failed, discarding 15 good results in the process.
const TIMEOUT_MS = 150_000;

// Use mock as final fallback whenever no real primary (Claude) key is configured
const IS_DEV_LLM = process.env.ANTHROPIC_API_KEY === 'sk-ant-placeholder';

// Tried in order. A provider without credentials is skipped rather than
// called and counted as a failure. Ollama only makes sense where a server is
// reachable (local dev), never on Vercel unless explicitly configured.
const hasKey = (k: string) => () => Boolean(process.env[k]) && process.env[k] !== 'sk-ant-placeholder';
const PROVIDERS: Array<ProviderConfig & { enabled: () => boolean }> = [
  { name: 'groq',   weight: 1.0,  call: callGroq,   enabled: hasKey('GROQ_API_KEY') },
  { name: 'claude', weight: 1.0,  call: callClaude, enabled: hasKey('ANTHROPIC_API_KEY') },
  { name: 'gpt',    weight: 0.95, call: callGpt,    enabled: hasKey('OPENAI_API_KEY') },
  { name: 'ollama', weight: 0.8,  call: callOllama, enabled: () => !process.env.VERCEL || Boolean(process.env.OLLAMA_BASE_URL) },
];

// Not worth starting another provider with less than this left in the budget
const MIN_ATTEMPT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`LLM timeout after ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * @param budgetMs total time allowed across all providers. Callers running
 *   inside a request (e.g. a Vercel function) pass their remaining duration so
 *   the fallback chain never outlives the function.
 */
export async function routeWithFallback(
  content: string,
  task: TaskType,
  quizOptions?: QuizGenerationOptions,
  budgetMs?: number,
): Promise<LlmResult> {
  const deadline = budgetMs ? Date.now() + budgetMs : Infinity;

  for (const provider of PROVIDERS) {
    if (!provider.enabled() || circuitBreaker.isOpen(provider.name)) continue;
    const remaining = deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) {
      console.warn(`[LLM Router] Out of time budget — not trying ${provider.name}`);
      break;
    }

    try {
      const raw = await withTimeout(provider.call(content, task, quizOptions), Math.min(TIMEOUT_MS, remaining));

      if (task === 'sds_extraction' && provider.weight < 1.0) {
        const result = raw as SdsExtractionResult;
        result.sections = adjustConfidence(result.sections, provider.weight);
        result.confidenceAdjusted = provider.weight < 1.0;
      }

      circuitBreaker.recordSuccess(provider.name);
      return raw;
    } catch (err) {
      console.error(`[LLM Router] ${provider.name} failed:`, err);
      circuitBreaker.recordFailure(provider.name);
    }
  }

  // Dev fallback: mock provider bypasses circuit breaker entirely
  if (IS_DEV_LLM) {
    console.warn('[LLM Router] All real providers failed — using dev mock');
    const raw = await callMock(content, task, quizOptions);
    return raw;
  }

  throw new AllProvidersFailedError();
}

export { circuitBreaker } from './circuit-breaker';
export { AllProvidersFailedError } from './types';
