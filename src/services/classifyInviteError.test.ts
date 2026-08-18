import { describe, expect, it } from 'vitest';
import { classifyInviteError } from '../../supabase/functions/_shared/classifyInviteError';

describe('classifyInviteError', () => {
  it('classifies a malformed email as invalid_email', () => {
    expect(classifyInviteError('Unable to validate email address: invalid format')).toBe('invalid_email');
    expect(classifyInviteError('Invalid email address')).toBe('invalid_email');
  });

  it('classifies the auth rate-limit error as rate_limited', () => {
    expect(classifyInviteError('Email rate limit exceeded')).toBe('rate_limited');
  });

  it('classifies an unauthorized email address as email_not_authorized', () => {
    expect(classifyInviteError('Email address not authorized')).toBe('email_not_authorized');
  });

  it('classifies a generic SMTP/delivery failure as email_delivery_failed', () => {
    expect(classifyInviteError('Error sending confirmation email')).toBe('email_delivery_failed');
    expect(classifyInviteError('SMTP connection timed out')).toBe('email_delivery_failed');
  });

  it('does not classify a non-format error as invalid_email just because the message mentions email', () => {
    // A valid QQ address (e.g. 1481459903@qq.com) that passes the client regex
    // must surface the real server category, never "invalid email".
    expect(classifyInviteError('Email rate limit exceeded')).not.toBe('invalid_email');
    expect(classifyInviteError('Email address not authorized')).not.toBe('invalid_email');
    expect(classifyInviteError('Error sending confirmation email')).not.toBe('invalid_email');
  });

  it('falls back to network for an unknown or empty message', () => {
    expect(classifyInviteError('')).toBe('network');
    expect(classifyInviteError(undefined)).toBe('network');
    expect(classifyInviteError('Unexpected internal failure')).toBe('network');
  });
});
