import crypto from 'crypto';

export interface IssuedCredential {
  email: string;
  name: string;
  role: 'access_manager' | 'admin';
  tempPassword: string;
  emailed: boolean;
}

export function generateTempPassword(): string {
  return crypto.randomBytes(9).toString('base64url').slice(0, 12);
}

/**
 * Best-effort email: there is no mail service yet, so a missing key or a send
 * failure must never fail the request — the super admin sees the temporary
 * password on screen and hands it over manually.
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

export const appLoginUrl = () => `${process.env.APP_URL ?? 'https://sds360-app.vercel.app'}/login`;
