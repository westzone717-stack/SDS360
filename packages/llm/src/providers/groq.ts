import OpenAI from 'openai';
import type { TaskType, LlmResult, QuizGenerationOptions, SdsExtractionResult } from '../types';
import { buildQuizPrompt, parseQuizResponse } from '../prompts';
import { extractSds } from '../batch-extract';

// Groq (api.groq.com) exposes an OpenAI-compatible Chat Completions API, so
// the OpenAI SDK works as-is with a different base URL and key.
// Lazily constructed — see comment in claude.ts for why (dotenv load-order).
let _client: OpenAI | undefined;
function getClient(): OpenAI {
  _client ??= new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });
  return _client;
}

const MODEL = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b';
// gpt-oss is a reasoning model: reasoning tokens count against this budget,
// so it needs more headroom than the JSON output alone would.
const MAX_COMPLETION_TOKENS = 16_384;

async function callOnce(prompt: string): Promise<string> {
  const completion = await getClient().chat.completions.create({
    model: MODEL,
    max_completion_tokens: MAX_COMPLETION_TOKENS,
    reasoning_effort: 'low',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });
  const text = completion.choices[0]?.message?.content ?? '{}';
  if (completion.choices[0]?.finish_reason === 'length') {
    console.warn('[Groq] Output truncated — JSON may be incomplete');
  }
  return text;
}

export async function callGroq(
  prompt: string,
  task: TaskType,
  quizOptions?: QuizGenerationOptions,
): Promise<LlmResult> {
  if (task === 'sds_extraction') {
    const { metadata, sections } = await extractSds('groq', prompt, callOnce);
    return { metadata, sections, modelUsed: 'groq', confidenceAdjusted: false } satisfies SdsExtractionResult;
  }

  const fullPrompt = buildQuizPrompt(prompt, quizOptions?.count ?? 5, quizOptions?.existingQuestions ?? []);
  const text = await callOnce(fullPrompt);
  return { ...parseQuizResponse(text), modelUsed: 'groq', forceReview: false };
}
