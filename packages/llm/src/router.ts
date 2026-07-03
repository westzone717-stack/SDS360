import { circuitBreaker } from './circuit-breaker';
import { callClaude } from './providers/claude';
import { callGpt } from './providers/gpt';
import { callOllama } from './providers/ollama';
import { callMock } from './providers/mock';
import { adjustConfidence } from './prompts';
import type { TaskType, LlmResult, ProviderConfig, SdsExtractionResult, QuizGenerationOptions } from './types';
import { AllProvidersFailedError } from './types';

const TIMEOUT_MS = 90_000;

// Use mock as final fallback whenever no real primary (Claude) key is configured
const IS_DEV_LLM = process.env.ANTHROPIC_API_KEY === 'sk-ant-placeholder';

const PROVIDERS: ProviderConfig[] = [
  { name: 'claude', weight: 1.0, call: callClaude },
  { name: 'gpt',    weight: 0.95, call: callGpt   },
  { name: 'ollama', weight: 0.8,  call: callOllama },
];

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`LLM timeout after ${ms}ms`)), ms)
    ),
  ]);
}

export async function routeWithFallback(
  content: string,
  task: TaskType,
  quizOptions?: QuizGenerationOptions,
): Promise<LlmResult> {
  for (const provider of PROVIDERS) {
    if (circuitBreaker.isOpen(provider.name)) continue;

    try {
      const raw = await withTimeout(provider.call(content, task, quizOptions), TIMEOUT_MS);

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
