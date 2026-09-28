import crypto from 'crypto';

export function generateTempPassword(): string {
  return crypto.randomBytes(9).toString('base64url').slice(0, 12);
}

/**
 * Best-effort email: there is no mail service yet, so a missing key or a send
 * failure must never fail the request — the person issuing the password sees
 * it on screen and hands it over manually.
 */
export async function trySendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM ?? 'noreply@sds360.com',
      to,
      subject,
      html,
    });
    if (error) {
      console.warn('[email] send failed', to, error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[email] send failed', to, err);
    return false;
  }
}

/** Login page of this app, derived from the request so it is right on every deployment. */
export const loginUrlFor = (req: Request) => `${new URL(req.url).origin}/login`;
