import { useState, type FormEvent } from 'react';
import { translate, type Locale, type MessageKey } from '../i18n/messages';

export interface SetPasswordResult {
  error: { message: string } | null;
}

export interface InviteAcceptProps {
  email?: string;
  setPassword: (password: string) => Promise<SetPasswordResult>;
  locale?: Locale;
}

export function InviteAccept({ email, setPassword, locale = 'zh-CN' }: InviteAcceptProps) {
  const [password, setPasswordValue] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = (key: MessageKey) => translate(locale, key);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (password.length < 6) {
      setError(t('invite.passwordTooShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('invite.passwordMismatch'));
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: resultError } = await setPassword(password);
    if (resultError) {
      setError(t('invite.failed'));
      setSubmitting(false);
      return;
    }
    // On success the provider's onAuthStateChange transitions the session
    // (the email is now confirmed) and unmounts this form; keep `submitting`
    // true until then to prevent a double submit.
  }

  return (
    <main className="auth-login">
      <div className="auth-login__brand">Northstar OKR</div>
      <h1 className="auth-login__title">{t('invite.welcome')}</h1>
      <p className="auth-login__subtitle">{t('invite.subtitle')}</p>
      <form className="auth-login__form" onSubmit={handleSubmit} noValidate>
        {email ? (
          <label className="auth-login__field">
            <span>{t('auth.email')}</span>
            <input type="email" value={email} disabled />
          </label>
        ) : null}
        <label className="auth-login__field">
          <span>{t('invite.newPassword')} *</span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => { setPasswordValue(event.target.value); setError(null); }}
            required
            disabled={submitting}
          />
        </label>
        <label className="auth-login__field">
          <span>{t('invite.confirmPassword')} *</span>
          <input
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
          {submitting ? t('invite.submitting') : t('invite.submit')}
        </button>
      </form>
    </main>
  );
}
