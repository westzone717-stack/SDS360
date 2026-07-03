import Anthropic from '@anthropic-ai/sdk';
import type { TaskType, LlmResult, QuizGenerationOptions } from '../types';
import { buildSdsPrompt, buildQuizPrompt, parseSdsResponse, parseQuizResponse } from '../prompts';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function callClaude(
  prompt: string,
  task: TaskType,
  quizOptions?: QuizGenerationOptions,
): Promise<LlmResult> {
  const fullPrompt =
    task === 'sds_extraction'
      ? buildSdsPrompt(prompt)
      : buildQuizPrompt(prompt, quizOptions?.count ?? 5, quizOptions?.existingQuestions ?? []);

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    messages: [{ role: 'user', content: fullPrompt }],
  });

  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  if (task === 'sds_extraction') {
    return { ...parseSdsResponse(text), modelUsed: 'claude', confidenceAdjusted: false };
  }
  return { ...parseQuizResponse(text), modelUsed: 'claude', forceReview: false };
}
