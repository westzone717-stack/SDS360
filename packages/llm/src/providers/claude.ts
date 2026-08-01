import Anthropic from '@anthropic-ai/sdk';
import type { TaskType, LlmResult, QuizGenerationOptions, SdsExtractionResult } from '../types';
import { buildQuizPrompt, parseQuizResponse } from '../prompts';
import { extractSds } from '../batch-extract';

// Lazily constructed so process.env.ANTHROPIC_API_KEY is read at call time,
// not at module-import time — dotenv config() in workers/src/index.ts runs
// after this module is loaded (ESM import statements are hoisted ahead of
// it), so a module-top-level `new Anthropic(...)` would capture an empty key.
let _client: Anthropic | undefined;
function getClient(): Anthropic {
  _client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

async function callOnce(prompt: string): Promise<string> {
  const message = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  });

  return message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');
}

export async function callClaude(
  prompt: string,
  task: TaskType,
  quizOptions?: QuizGenerationOptions,
): Promise<LlmResult> {
  if (task === 'sds_extraction') {
    const { metadata, sections } = await extractSds('claude', prompt, callOnce);
    return { metadata, sections, modelUsed: 'claude', confidenceAdjusted: false } satisfies SdsExtractionResult;
  }

  const fullPrompt = buildQuizPrompt(prompt, quizOptions?.count ?? 5, quizOptions?.existingQuestions ?? []);
  const text = await callOnce(fullPrompt);
  return { ...parseQuizResponse(text), modelUsed: 'claude', forceReview: false };
}
