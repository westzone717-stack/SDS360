import type { TaskType, LlmResult, QuizGenerationOptions } from '../types';
import { buildSdsPrompt, buildQuizPrompt, parseSdsResponse, parseQuizResponse } from '../prompts';

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const OLLAMA_MODEL = 'llama3.1:70b';

export async function callOllama(
  prompt: string,
  task: TaskType,
  quizOptions?: QuizGenerationOptions,
): Promise<LlmResult> {
  const fullPrompt =
    task === 'sds_extraction'
      ? buildSdsPrompt(prompt)
      : buildQuizPrompt(prompt, quizOptions?.count ?? 5, quizOptions?.existingQuestions ?? []);

  const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: fullPrompt,
      stream: false,
      format: 'json',
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = (await res.json()) as { response: string };

  if (task === 'sds_extraction') {
    return {
      ...parseSdsResponse(data.response),
      modelUsed: 'ollama',
      confidenceAdjusted: false,
    };
  }
  // Ollama quiz responses are forced to human review
  return { ...parseQuizResponse(data.response), modelUsed: 'ollama', forceReview: true };
}
