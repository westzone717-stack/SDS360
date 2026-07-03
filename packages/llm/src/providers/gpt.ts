import OpenAI from 'openai';
import type { TaskType, LlmResult, SdsExtractionResult, QuizGenerationOptions } from '../types';
import {
  buildSdsPrompt,
  buildQuizPrompt,
  parseSdsResponse,
  parseQuizResponse,
  SDS_SECTION_BATCHES,
} from '../prompts';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL = 'gpt-4o-mini';
const MAX_TOKENS_PER_BATCH = 8192;

async function callOnce(prompt: string, maxTokens: number): Promise<string> {
  const completion = await client.chat.completions.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });
  const text = completion.choices[0]?.message?.content ?? '{}';
  const finish = completion.choices[0]?.finish_reason;
  console.log(`[GPT] model=${MODEL} finish=${finish} len=${text.length}`);
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
    // Batch extract 16 sections across 4 parallel calls (4 sections each)
    const documentText = prompt;
    const batchResults = await Promise.all(
      SDS_SECTION_BATCHES.map(async (batch) => {
        const subPrompt = buildSdsPrompt(documentText, batch);
        const text = await callOnce(subPrompt, MAX_TOKENS_PER_BATCH);
        return parseSdsResponse(text, batch).sections;
      })
    );

    // Merge all 4 batch results into a single sections object
    const mergedSections: SdsExtractionResult['sections'] = {};
    for (const batchSections of batchResults) {
      Object.assign(mergedSections, batchSections);
    }

    console.log(`[GPT] SDS extraction complete — ${Object.keys(mergedSections).length} sections, ` +
      `${Object.values(mergedSections).filter((s) => s.content.length > 0).length} non-empty`);

    return { sections: mergedSections, modelUsed: 'gpt', confidenceAdjusted: false };
  }

  // quiz_generation — single call
  const fullPrompt = buildQuizPrompt(prompt, quizOptions?.count ?? 5, quizOptions?.existingQuestions ?? []);
  const text = await callOnce(fullPrompt, MAX_TOKENS_PER_BATCH);
  return { ...parseQuizResponse(text), modelUsed: 'gpt', forceReview: false };
}
