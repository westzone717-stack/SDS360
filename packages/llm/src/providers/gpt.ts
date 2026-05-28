import OpenAI from 'openai';
import type { TaskType, LlmResult } from '../types';
import { buildSdsPrompt, buildQuizPrompt, parseSdsResponse, parseQuizResponse } from '../prompts';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function callGpt(prompt: string, task: TaskType): Promise<LlmResult> {
  const fullPrompt = task === 'sds_extraction' ? buildSdsPrompt(prompt) : buildQuizPrompt(prompt);

  const completion = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 8192,
    messages: [{ role: 'user', content: fullPrompt }],
    response_format: { type: 'json_object' },
  });

  const text = completion.choices[0]?.message?.content ?? '{}';

  if (task === 'sds_extraction') {
    return { ...parseSdsResponse(text), modelUsed: 'gpt', confidenceAdjusted: false };
  }
  return { ...parseQuizResponse(text), modelUsed: 'gpt', forceReview: false };
}
