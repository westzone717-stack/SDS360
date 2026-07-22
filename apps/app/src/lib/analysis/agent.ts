import mongoose from 'mongoose';
import { connectDb, SdsDocumentModel } from '@sds360/db';
import type { AnalysisPlan, AnalysisStepResult } from '@sds360/types';
import { TOOL_REGISTRY, getToolManifest } from './tools';
import { generateAnalysisPlan, generateAnalysisReport } from './llm';
import { analysisDebugLog } from './debug-log';

// A lightweight name-only index handed to the plan-generation prompt so the
// LLM can tell whether "this product"/"the document" is actually ambiguous
// (multiple SDS docs exist) before it ever calls a tool. This is metadata
// only — no document content — so it doesn't defeat the "LLM never touches
// data directly" boundary; it's the same kind of fixed context as "today's
// date".
async function getKnownProductNames(customerId: string): Promise<string[]> {
  await connectDb();
  const docs = await SdsDocumentModel.find(
    { customerId: new mongoose.Types.ObjectId(customerId), status: { $ne: 'deleted' } },
    { productName: 1 },
  ).lean<Array<{ productName: string }>>();
  return docs.map((d) => d.productName);
}

// Keys an LLM might hallucinate into `args` in an attempt to widen its own
// scope (prompt injection). They're stripped before a tool ever sees the
// args object — tenant scoping comes exclusively from the server-injected
// ToolContext, never from anything the model produced.
const FORBIDDEN_ARG_KEYS = new Set(['customerId', 'tenant', 'tenantId', 'companyId', 'company_id', 'orgId', 'organizationId']);

function sanitizeArgs(args: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!args) return {};
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (FORBIDDEN_ARG_KEYS.has(key)) continue;
    clean[key] = value;
  }
  return clean;
}

export interface AnalysisResult {
  plan: AnalysisPlan;
  stepResults: AnalysisStepResult[];
  report: string;
  needsClarification: boolean;
  candidates?: string[];
}

/**
 * Runs the full analysis pipeline for one user request:
 *   1. Ask the LLM for a structured plan, given only tool names/descriptions.
 *   2. Execute each planned tool call — customerId is injected here, from the
 *      authenticated session, and is the ONLY tenant scope every tool uses.
 *   3. Feed the gathered data back to the LLM and ask it to write the report.
 *
 * `customerId` must come from the caller's authenticated session. It is never
 * read from the plan or from user input, so no request — regardless of what
 * it asks for — can cause a tool to touch another tenant's data.
 */
export async function runAnalysis(customerId: string, userRequest: string): Promise<AnalysisResult> {
  const toolManifest = getToolManifest();
  const knownProductNames = await getKnownProductNames(customerId);
  const plan = await generateAnalysisPlan(userRequest, toolManifest, knownProductNames);

  analysisDebugLog(`[analysis] Plan for request "${userRequest}":\n${JSON.stringify(plan, null, 2)}`);

  // The request named "this/the document" without saying which one, and more
  // than one exists — don't guess or silently mix data across products. Skip
  // tool execution and report generation entirely; hand the question straight
  // back to the user.
  //
  // knownProductNames.length >= 2 is checked here, in code, rather than
  // trusting the LLM to only ask when it's actually ambiguous — a model can
  // (and did, in testing) ask for clarification even with a single known
  // product. This makes "is it actually ambiguous" a deterministic fact the
  // agent verifies, not something the model's prompt-following has to get
  // right on its own.
  if (plan.clarificationNeeded && knownProductNames.length >= 2) {
    analysisDebugLog(`[analysis] Ambiguous request — asking user to clarify instead of running the plan: ${plan.clarificationNeeded}`);
    return { plan, stepResults: [], report: plan.clarificationNeeded, needsClarification: true, candidates: knownProductNames };
  }

  // Overridden false-positive: the LLM's own "steps" for a clarification
  // response is just a trivial placeholder, so re-ask for a real plan with
  // the ambiguity question turned off rather than trying to execute it.
  let effectivePlan = plan;
  if (plan.clarificationNeeded) {
    analysisDebugLog(`[analysis] LLM asked for clarification but only ${knownProductNames.length} product(s) exist — regenerating the plan without that option.`);
    effectivePlan = await generateAnalysisPlan(userRequest, toolManifest, knownProductNames, { forceNoClarification: true });
    analysisDebugLog(`[analysis] Regenerated plan:\n${JSON.stringify(effectivePlan, null, 2)}`);
  }

  const stepResults: AnalysisStepResult[] = [];

  for (const step of effectivePlan.steps) {
    if (!step.tool) continue; // e.g. a plain "action": "summarize" marker — nothing to execute

    const tool = TOOL_REGISTRY[step.tool];
    if (!tool) {
      stepResults.push({ id: step.id, tool: step.tool, error: `Unknown tool "${step.tool}"` });
      continue;
    }

    try {
      const safeArgs = sanitizeArgs(step.args);
      // Tenant scope is injected here — the only place it ever enters a tool call.
      const data = await tool.execute({ customerId }, safeArgs);
      stepResults.push({ id: step.id, tool: step.tool, data });
    } catch (err) {
      stepResults.push({ id: step.id, tool: step.tool, error: err instanceof Error ? err.message : String(err) });
    }
  }

  analysisDebugLog(`[analysis] Step results (context handed back to the LLM for report writing):\n${JSON.stringify(stepResults, null, 2)}`);

  const report = await generateAnalysisReport(userRequest, stepResults);

  return { plan: effectivePlan, stepResults, report, needsClarification: false };
}
