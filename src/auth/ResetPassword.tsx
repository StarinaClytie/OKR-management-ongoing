import { useState, type FormEvent } from 'react';
import { translate, type Locale, type MessageKey } from '../i18n/messages';

export interface ResetPasswordResult {
  error: { message: string } | null;
}

export interface ResetPasswordProps {
  onSubmit: (password: string) => Promise<ResetPasswordResult>;
  onBack: () => void;
  locale?: Locale;
}

function resetErrorMessage(error: { message: string }, t: (key: MessageKey) => string): string {
  const message = error.message.toLowerCase();
  if (
    message.includes('expired') ||
    message.includes('invalid') ||
    message.includes('token') ||
    message.includes('otp') ||
    message.includes('grant')
  ) {
    return t('reset.expired');
  }
  return t('reset.failed');
}

export function ResetPassword({ onSubmit, onBack, locale = 'zh-CN' }: ResetPasswordProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = (key: MessageKey) => translate(locale, key);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (password.length < 6) {
      setError(t('reset.passwordTooShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('reset.passwordMismatch'));
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: resultError } = await onSubmit(password);
    if (resultError) {
      setError(resetErrorMessage(resultError, t));
      setSubmitting(false);
      return;
    }
    // On success the provider upgrades the recovery session to a full session
    // and transitions to signed-in; keep `submitting` true to prevent a double submit.
  }

  return (
    <main className="auth-login">
      <div className="auth-login__brand">瞬谱光电 · TIME-TECH SPECTRA</div>
      <h1 className="auth-login__title">{t('reset.title')}</h1>
      <p className="auth-login__subtitle">{t('reset.description')}</p>
      <form className="auth-login__form" onSubmit={handleSubmit} noValidate>
        <label className="auth-login__field" htmlFor="reset-password">
          <span>{t('reset.newPassword')}</span>
          <input
            id="reset-password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => { setPassword(event.target.value); setError(null); }}
            required
            disabled={submitting}
          />
        </label>
        <label className="auth-login__field" htmlFor="reset-confirm">
          <span>{t('reset.confirmPassword')}</span>
          <input
            id="reset-confirm"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => { setConfirm(event.target.value); setError(null); }}
            required
            disabled={submitting}
          />
        </label>
        {error ? <p className="form-error auth-login__error" role="alert">{error}</p> : null}
        <button className="button button--primary auth-login__submit" type="submit" disabled={submitting}>
          {submitting ? t('reset.submitting') : t('reset.submit')}
        </button>
      </form>
      <p className="auth-login__register">
        <button type="button" className="text-button" onClick={onBack}>{t('reset.backToSignIn')}</button>
      </p>
    </main>
  );
}
