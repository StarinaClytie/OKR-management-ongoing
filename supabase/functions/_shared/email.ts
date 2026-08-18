// Provider-agnostic transactional email sender.
//
// The Resources & Supplies module must not be permanently tied to one email
// provider. Business logic depends only on `sendTransactionalEmail`; the
// provider-specific implementation is isolated here. Today only Resend is
// supported and it is gated on RESEND_API_KEY — with no provider configured,
// `sendTransactionalEmail` returns `email_not_configured` so the notification
// audit trail can record a traceable, retryable failure instead of dropping the
// message silently.
//
// When a production provider is chosen (SMTP, Aliyun DirectMail, ...), add a
// provider branch here without touching callers. Nothing in the frontend or the
// domain model references a provider.

export interface TransactionalEmail {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export type SendEmailErrorCode =
  | 'email_not_configured'
  | 'provider_unreachable'
  | 'provider_error';

export type SendEmailResult =
  | { ok: true }
  | { ok: false; code: SendEmailErrorCode };

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'Northstar OKR <no-reply@okr.groupmeeting.xyz>';

export async function sendTransactionalEmail(email: TransactionalEmail): Promise<SendEmailResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    return { ok: false, code: 'email_not_configured' };
  }

  const from = Deno.env.get('RESEND_FROM_EMAIL') ?? DEFAULT_FROM;
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        ...(email.html ? { html: email.html } : {}),
      }),
    });
    if (!response.ok) {
      return { ok: false, code: 'provider_error' };
    }
    return { ok: true };
  } catch {
    return { ok: false, code: 'provider_unreachable' };
  }
}
