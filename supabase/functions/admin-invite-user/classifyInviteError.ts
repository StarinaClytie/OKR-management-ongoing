// Pure classifier for `auth.admin.inviteUserByEmail` failures.
//
// The browser must never see raw Supabase Auth internals, but the administrator
// still needs to know *why* an invitation failed. This maps an Auth error
// message to a coarse, non-secret category so the frontend can render a useful
// localized hint.
//
// The single most important rule here: `invalid_email` is ONLY returned when the
// message unambiguously describes the address *syntax/format* itself. It must
// never be inferred from the mere presence of the word "email" (or "valid") —
// Supabase reports rate limits, allowlist rejections, and SMTP/provider failures
// with messages that also mention "email", and those are not the administrator's
// problem to fix by retyping the address.

export type InviteSendErrorCode =
  | 'invalid_email'
  | 'rate_limited'
  | 'email_not_authorized'
  | 'email_delivery_failed'
  | 'network';

export function classifyInviteError(message: string | null | undefined): InviteSendErrorCode {
  const msg = (message ?? '').toLowerCase();

  // 1. Syntax/format — only these narrow, explicit patterns. Deliberately no
  //    `includes('email')` / `includes('valid')` here: those also match
  //    "Email rate limit exceeded", "Email address not authorized", and
  //    "Error sending confirmation email".
  if (
    msg.includes('invalid format') ||
    msg.includes('invalid email') ||
    msg.includes('unable to validate email') ||
    msg.includes('not a valid email') ||
    msg.includes('email address is not valid')
  ) {
    return 'invalid_email';
  }

  // 2. Rate limiting (e.g. "Email rate limit exceeded").
  if (msg.includes('rate limit') || msg.includes('too many')) {
    return 'rate_limited';
  }

  // 3. The address is not permitted for this project (allowlist / domain /
  //    signups-disabled), e.g. "Email address not authorized".
  if (msg.includes('not authorized') || msg.includes('not allowed')) {
    return 'email_not_authorized';
  }

  // 4. The address was accepted but the message could not be delivered (SMTP /
  //    provider / send failure), e.g. "Error sending confirmation email".
  if (
    msg.includes('error sending') ||
    msg.includes('unable to send') ||
    msg.includes('failed to send') ||
    msg.includes('send failed') ||
    msg.includes('smtp') ||
    msg.includes('provider') ||
    msg.includes('delivery')
  ) {
    return 'email_delivery_failed';
  }

  // 5. Anything else — no safe classification, so do not guess.
  return 'network';
}
