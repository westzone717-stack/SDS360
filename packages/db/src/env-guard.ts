// Fails fast on process startup in production if any secret/API key is still
// a known local-dev placeholder value. Without this, the app boots "normally"
// but every affected feature silently degrades — LLM calls fall back to a
// mock provider, S3 uploads fall back to local disk that doesn't survive a
// container restart, emails silently fail to send — with no error anywhere
// in the request path. Better to refuse to start than to run broken in prod.

const DEV_PLACEHOLDER_VALUES = new Set(['sk-ant-placeholder', 'placeholder', 're_placeholder']);

const SECRET_ENV_VARS = ['ADMIN_NEXTAUTH_SECRET', 'APP_NEXTAUTH_SECRET', 'AUTH_SECRET'] as const;

let checked = false;

export function assertProductionEnv(): void {
  if (checked) return;
  checked = true;
  if (process.env.NODE_ENV !== 'production') return;

  const problems: string[] = [];
  const warnings: string[] = [];

  // Claude missing a real key is only fatal if NO real LLM provider is
  // configured — routeWithFallback tries Claude -> GPT -> Ollama -> mock, so
  // as long as OPENAI_API_KEY is real, the system degrades to GPT (still a
  // working, non-mock provider) rather than silently faking results. Only
  // block startup when the fallback chain would bottom out at the mock.
  const anthropicIsPlaceholder = DEV_PLACEHOLDER_VALUES.has(process.env.ANTHROPIC_API_KEY ?? '');
  const openaiConfigured = !!process.env.OPENAI_API_KEY;
  if (anthropicIsPlaceholder && !openaiConfigured) {
    problems.push('ANTHROPIC_API_KEY is still the dev placeholder and OPENAI_API_KEY is not set — no real LLM provider is configured, so calls will silently fall back to the mock provider.');
  } else if (anthropicIsPlaceholder) {
    warnings.push('ANTHROPIC_API_KEY is still the dev placeholder — Claude calls will fail over to GPT every time (extra latency, and no Claude-specific quality/behavior). Fine to run like this, but worth fixing when convenient.');
  }

  if (DEV_PLACEHOLDER_VALUES.has(process.env.AWS_ACCESS_KEY_ID ?? '')) {
    problems.push('AWS_ACCESS_KEY_ID is still the dev placeholder — file uploads will silently fall back to local disk, which does not persist across container restarts.');
  }
  if (DEV_PLACEHOLDER_VALUES.has(process.env.RESEND_API_KEY ?? '')) {
    problems.push('RESEND_API_KEY is still the dev placeholder — outbound emails (OTP, notifications) will silently fail to send.');
  }

  // Not every service needs every NextAuth secret (workers needs none of
  // them; apps/app only needs APP_NEXTAUTH_SECRET + AUTH_SECRET; apps/admin
  // only needs ADMIN_NEXTAUTH_SECRET + AUTH_SECRET) — this shared guard runs
  // in all three processes via connectDb(), so it can't require any specific
  // one to be present. It only validates the *quality* of whichever ones a
  // given service actually has configured.
  for (const name of SECRET_ENV_VARS) {
    const value = process.env[name];
    if (value && (value.length < 32 || value.includes('-local') || value.includes('dev-secret'))) {
      problems.push(`${name} looks like a development placeholder, not a production secret.`);
    }
  }

  if (warnings.length > 0) {
    console.warn(`[env-guard] Non-fatal configuration warnings:\n- ${warnings.join('\n- ')}`);
  }

  if (problems.length > 0) {
    throw new Error(
      `Refusing to start with NODE_ENV=production and unsafe configuration:\n- ${problems.join('\n- ')}`
    );
  }
}
