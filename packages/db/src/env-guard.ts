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

  if (DEV_PLACEHOLDER_VALUES.has(process.env.ANTHROPIC_API_KEY ?? '')) {
    problems.push('ANTHROPIC_API_KEY is still the dev placeholder — LLM calls will silently fall back to the mock provider.');
  }
  if (DEV_PLACEHOLDER_VALUES.has(process.env.AWS_ACCESS_KEY_ID ?? '')) {
    problems.push('AWS_ACCESS_KEY_ID is still the dev placeholder — file uploads will silently fall back to local disk, which does not persist across container restarts.');
  }
  if (DEV_PLACEHOLDER_VALUES.has(process.env.RESEND_API_KEY ?? '')) {
    problems.push('RESEND_API_KEY is still the dev placeholder — outbound emails (OTP, notifications) will silently fail to send.');
  }

  for (const name of SECRET_ENV_VARS) {
    const value = process.env[name];
    if (!value) {
      problems.push(`${name} is not set.`);
    } else if (value.length < 32 || value.includes('-local') || value.includes('dev-secret')) {
      problems.push(`${name} looks like a development placeholder, not a production secret.`);
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Refusing to start with NODE_ENV=production and unsafe configuration:\n- ${problems.join('\n- ')}`
    );
  }
}
