import type { TaskType, LlmResult, QuizGenerationOptions, SdsExtractionResult } from '../types';
import { buildQuizPrompt, parseQuizResponse } from '../prompts';
import { extractSectionsBatched } from '../batch-extract';

const OLLAMA_MODEL = 'llama3.1:70b';

async function callOnce(prompt: string): Promise<string> {
  // Read at call time, not module-load time — see comment in claude.ts.
  const ollamaBase = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  const res = await fetch(`${ollamaBase}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      format: 'json',
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = (await res.json()) as { response: string };
  return data.response;
}

export async function callOllama(
  prompt: string,
  task: TaskType,
  quizOptions?: QuizGenerationOptions,
): Promise<LlmResult> {
  if (task === 'sds_extraction') {
    const sections = await extractSectionsBatched('ollama', prompt, callOnce);
    return { sections, modelUsed: 'ollama', confidenceAdjusted: false } satisfies SdsExtractionResult;
  }

  // Ollama quiz responses are forced to human review
  const fullPrompt = buildQuizPrompt(prompt, quizOptions?.count ?? 5, quizOptions?.existingQuestions ?? []);
  const text = await callOnce(fullPrompt);
  return { ...parseQuizResponse(text), modelUsed: 'ollama', forceReview: true };
}
