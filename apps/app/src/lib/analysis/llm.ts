import { generateObject, generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import type { AnalysisPlan, AnalysisStepResult } from '@sds360/types';
import { analysisDebugLog } from './debug-log';

const IS_DEV_LLM = process.env.ANTHROPIC_API_KEY === 'sk-ant-placeholder';

// Lazy — read env vars at call time, not module-load time.
function anthropicModel() {
  return createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })('claude-sonnet-4-6');
}
function openaiModel() {
  return createOpenAI({ apiKey: process.env.OPENAI_API_KEY })('gpt-4o-mini');
}

// OpenAI's strict structured-output mode requires every property to appear
// in the JSON Schema "required" array — it doesn't support keys that are
// simply absent. `.optional()` drops a key out of "required" (breaks strict
// mode); `.nullable()` keeps it required but allows `null`, which is the
// pattern OpenAI's structured outputs actually expect for "this field doesn't
// apply." We normalize null → undefined in normalizePlan() below so the rest
// of the codebase only ever deals with the plain optional-field shape.
const planStepSchema = z.object({
  id: z.string().describe('short step identifier, e.g. "step1"'),
  tool: z.string().nullable().describe('the tool name to call for this step, or null if none'),
  // Some tools take list-valued args (e.g. productNames, sectionKeys) — the
  // value union must include string[] or the model has no valid way to
  // express them and ends up emitting mangled output trying to anyway.
  args: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).nullable().describe('arguments for the tool, or null'),
  action: z.string().nullable().describe('for non-tool steps e.g. "summarize", or null'),
});
const planSchema = z.object({
  clarificationNeeded: z.string().nullable().describe(
    'Set this to a clarifying question ONLY if the request refers to a specific, unnamed document (e.g. "this product", "the document", "it") and the product list above has more than one entry, so it is genuinely ambiguous which one is meant. The question must list the candidate product names so the user can pick. Otherwise null.'
  ),
  steps: z.array(planStepSchema).min(1).max(10),
});

function normalizePlan(raw: z.infer<typeof planSchema>): AnalysisPlan {
  return {
    steps: raw.steps.map((s) => ({
      id: s.id,
      tool: s.tool ?? undefined,
      args: s.args ?? undefined,
      action: s.action ?? undefined,
    })),
    clarificationNeeded: raw.clarificationNeeded ?? undefined,
  };
}

function planPrompt(
  userRequest: string,
  toolManifest: Array<{ name: string; description: string; argsShape: string }>,
  knownProductNames: string[],
  forceNoClarification: boolean,
) {
  const toolList = toolManifest.map((t) => `- ${t.name}(${t.argsShape}): ${t.description}`).join('\n');
  const today = new Date().toISOString().slice(0, 10);
  const productList = knownProductNames.length > 0
    ? knownProductNames.map((n) => `- ${n}`).join('\n')
    : '(no SDS documents in the library yet)';

  const ambiguitySection = forceNoClarification
    ? `There is only one SDS document in this organization's library${knownProductNames[0] ? ` ("${knownProductNames[0]}")` : ''}. Any reference to "this/the/that product/document/SDS" refers to it specifically — there is no ambiguity. Set "clarificationNeeded" to null and build a normal plan using that document.`
    : `FIRST, check for ambiguity: if the request refers to a specific document without naming it ("this product", "the document", "it", "this SDS") and the product list above has more than one entry, you cannot know which one is meant. In that case, set "clarificationNeeded" to a question listing the candidate product names by name, and give "steps" a single trivial step (id "step1", tool null, args null, action "summarize") — no tool calls, since you don't yet know which document to query. Do NOT guess a product name and do NOT silently run the query across all documents in this case.

If the request already names a specific product, or applies generally across all documents (e.g. "compliance overview", "how many documents do we have"), or there is only one document in the list above, there is no ambiguity — set "clarificationNeeded" to null and build a normal plan.`;

  return `You are a data-analysis planning assistant for a workplace safety platform. A user has asked for an analysis. Break their request into a short sequence of steps using ONLY the tools listed below — you cannot access any data directly, only by naming a tool and its arguments.

Today's date is ${today}.

SDS product names currently in this organization's library (this is just an index of names for identifying which document the user means — it is NOT the document content itself):
${productList}

Available tools:
${toolList}

User request:
"${userRequest}"

${ambiguitySection}

Return a JSON plan: an ordered list of steps. Each step either calls one tool (with an "id", "tool" name, and "args" matching that tool's shape, and "action" set to null) or is a final non-tool step with "action":"summarize" (and "tool"/"args" set to null) marking that all data has been gathered. Only use tool names from the list above. Keep the plan minimal — only include steps whose data is actually relevant to the request.

IMPORTANT: Optional filter arguments like "year" or "department" must be omitted (set to null in args, or left out of an empty args object) unless the user's request explicitly names that filter. Never guess, default, or invent a value for an optional argument — an unfiltered query (all data, no year/department restriction) is almost always what the user wants unless they said otherwise.`;
}

function reportPrompt(userRequest: string, stepResults: AnalysisStepResult[]) {
  const dataBlock = stepResults
    .map((r) => {
      if (r.error) return `[${r.id} — ${r.tool ?? 'unknown tool'}] ERROR: ${r.error}`;
      return `[${r.id} — ${r.tool}]\n${JSON.stringify(r.data, null, 2)}`;
    })
    .join('\n\n');

  return `You are a data-analysis assistant for a workplace safety platform. The user asked:
"${userRequest}"

The following data was gathered on their behalf by calling internal tools (scoped to their own organization only):

${dataBlock}

Write a clear, well-organized analysis report in Markdown answering the user's request using ONLY the data above. Do not invent numbers that aren't present in the data. If a tool returned an error, acknowledge that gap plainly. Include a short summary at the top, then supporting detail with concrete numbers, then any notable takeaways.`;
}

function mockPlan(): AnalysisPlan {
  return {
    steps: [
      { id: 'step1', tool: 'get_sds_overview', args: {} },
      { id: 'step2', tool: 'get_training_compliance', args: {} },
      { id: 'step3', action: 'summarize' },
    ],
  };
}

function mockReport(userRequest: string, stepResults: AnalysisStepResult[]): string {
  return `# Analysis Report (dev mock)\n\nRequest: "${userRequest}"\n\n\`\`\`json\n${JSON.stringify(stepResults, null, 2)}\n\`\`\`\n\n_No live LLM configured — this is a placeholder report generated from raw step data._`;
}

/**
 * Generates the structured plan. Tries Claude, then GPT, then (dev-only) a
 * deterministic mock — mirroring packages/llm's routeWithFallback so one
 * provider being down never blocks the whole request.
 */
export async function generateAnalysisPlan(
  userRequest: string,
  toolManifest: Array<{ name: string; description: string; argsShape: string }>,
  knownProductNames: string[],
  options?: { forceNoClarification?: boolean },
): Promise<AnalysisPlan> {
  const prompt = planPrompt(userRequest, toolManifest, knownProductNames, options?.forceNoClarification ?? false);

  analysisDebugLog(`[analysis] Full plan-generation prompt sent to the LLM:\n${prompt}`);

  try {
    const { object } = await generateObject({ model: anthropicModel(), schema: planSchema, prompt });
    return normalizePlan(object);
  } catch (err) {
    console.error('[analysis] Claude plan generation failed:', err);
  }

  try {
    const { object } = await generateObject({ model: openaiModel(), schema: planSchema, prompt });
    return normalizePlan(object);
  } catch (err) {
    console.error('[analysis] GPT plan generation failed:', err);
  }

  if (IS_DEV_LLM) {
    console.warn('[analysis] All providers failed — using dev mock plan');
    return mockPlan();
  }

  throw new Error('All LLM providers failed to generate an analysis plan');
}

/**
 * Synthesizes the final report from gathered step data. Same fallback order
 * as generateAnalysisPlan.
 */
export async function generateAnalysisReport(
  userRequest: string,
  stepResults: AnalysisStepResult[],
): Promise<string> {
  const prompt = reportPrompt(userRequest, stepResults);

  analysisDebugLog(`[analysis] Full report-generation prompt sent to the LLM:\n${prompt}`);

  try {
    const { text } = await generateText({ model: anthropicModel(), prompt });
    return text;
  } catch (err) {
    console.error('[analysis] Claude report generation failed:', err);
  }

  try {
    const { text } = await generateText({ model: openaiModel(), prompt });
    return text;
  } catch (err) {
    console.error('[analysis] GPT report generation failed:', err);
  }

  if (IS_DEV_LLM) {
    console.warn('[analysis] All providers failed — using dev mock report');
    return mockReport(userRequest, stepResults);
  }

  throw new Error('All LLM providers failed to generate an analysis report');
}
