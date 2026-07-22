// Analysis pipeline debug logging — off by default. These logs print full
// LLM prompts, user request text, and the raw data gathered from tenant data
// (via tool calls), which is too sensitive/verbose to leave on by default in
// production. Set ANALYSIS_DEBUG=true to enable when actually debugging a
// plan/report generation issue.
const ANALYSIS_DEBUG = process.env.ANALYSIS_DEBUG === 'true';

export function analysisDebugLog(message: string): void {
  if (!ANALYSIS_DEBUG) return;
  console.log(message);
}
