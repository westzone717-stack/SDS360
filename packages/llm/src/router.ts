import { circuitBreaker } from './circuit-breaker';
import { callClaude } from './providers/claude';
import { callGpt } from './providers/gpt';
import { callOllama } from './providers/ollama';
import { adjustConfidence } from './prompts';
import type { TaskType, LlmResult, ProviderConfig, SdsExtractionResult } from './types';
import { AllProvidersFailedError } from './types';

const TIMEOUT_MS = 90_000;

const PROVIDERS: ProviderConfig[] = [
  { name: 'claude', weight: 1.0, call: callClaude },
  { name: 'gpt', weight: 0.95, call: callGpt },
  { name: 'ollama', weight: 0.8, call: callOllama },
];

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`LLM timeout after ${ms}ms`)), ms)
    ),
  ]);
}

export async function routeWithFallback(prompt: string, task: TaskType): Promise<LlmResult> {
  for (const provider of PROVIDERS) {
    if (circuitBreaker.isOpen(provider.name)) continue;

    try {
      const raw = await withTimeout(provider.call(prompt, task), TIMEOUT_MS);

      // Apply confidence weight for non-primary providers
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

  throw new AllProvidersFailedError();
}

export { circuitBreaker } from './circuit-breaker';
export { AllProvidersFailedError } from './types';
