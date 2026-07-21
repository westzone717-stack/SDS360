import OpenAI from 'openai';
import type { TaskType, LlmResult, QuizGenerationOptions, SdsExtractionResult } from '../types';
import { buildQuizPrompt, parseQuizResponse } from '../prompts';
import { extractSectionsBatched } from '../batch-extract';

// Lazily constructed — see comment in claude.ts for why (dotenv load-order).
let _client: OpenAI | undefined;
function getClient(): OpenAI {
  _client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

const MODEL = 'gpt-4o-mini';
const MAX_TOKENS = 8192;

async function callOnce(prompt: string): Promise<string> {
  const completion = await getClient().chat.completions.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });
  const text = completion.choices[0]?.message?.content ?? '{}';
  const finish = completion.choices[0]?.finish_reason;
  if (finish === 'length') {
    console.warn('[GPT] Output truncated — JSON may be incomplete');
  }
  return text;
}

export async function callGpt(
  prompt: string,
  task: TaskType,
  quizOptions?: QuizGenerationOptions,
): Promise<LlmResult> {
  if (task === 'sds_extraction') {
    const sections = await extractSectionsBatched('gpt', prompt, callOnce);

    const fieldCount = Object.values(sections)
      .flatMap((s) => Object.values(s.subsections))
      .flatMap((sub) => Object.values(sub.fields));
    const nonEmptyCount = fieldCount.filter((f) => f.content.length > 0).length;
    console.log(`[GPT] SDS extraction complete — ${Object.keys(sections).length} sections, ` +
      `${fieldCount.length} fields, ${nonEmptyCount} non-empty`);

    return { sections, modelUsed: 'gpt', confidenceAdjusted: false } satisfies SdsExtractionResult;
  }

  // quiz_generation — single call
  const fullPrompt = buildQuizPrompt(prompt, quizOptions?.count ?? 5, quizOptions?.existingQuestions ?? []);
  const text = await callOnce(fullPrompt);
  return { ...parseQuizResponse(text), modelUsed: 'gpt', forceReview: false };
}
