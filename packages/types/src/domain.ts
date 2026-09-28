// ─── Customer email-domain helpers ─────────────────────────────────────────────
// Self-registration assigns new users to the customer whose `domain` matches
// their email suffix, so a customer domain must be company-owned, never a
// free/public mailbox provider.

export const PUBLIC_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com', 'googlemail.com',
  'hotmail.com', 'hotmail.ca', 'hotmail.co.uk',
  'outlook.com', 'outlook.ca', 'live.com', 'live.ca', 'msn.com',
  'yahoo.com', 'yahoo.ca', 'yahoo.co.uk', 'ymail.com', 'rocketmail.com',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'proton.me', 'protonmail.com', 'pm.me',
  'gmx.com', 'gmx.net', 'mail.com', 'zoho.com', 'yandex.com', 'yandex.ru',
  'qq.com', 'foxmail.com', '163.com', '126.com', 'yeah.net', 'sina.com', 'sina.cn', 'sohu.com',
  'aliyun.com', '139.com',
  'shaw.ca', 'rogers.com', 'sympatico.ca', 'telus.net', 'bell.net',
]);

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** "  @Acme.COM " / "https://www.acme.com/" → "acme.com" */
export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^@/, '')
    .replace(/^www\./, '');
}

export function isValidDomain(domain: string): boolean {
  return DOMAIN_RE.test(domain);
}

export function isPublicEmailDomain(domain: string): boolean {
  return PUBLIC_EMAIL_DOMAINS.has(domain.toLowerCase());
}

/** Lower-cased part after the last "@", or "" if there is none. */
export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1).trim().toLowerCase();
}
