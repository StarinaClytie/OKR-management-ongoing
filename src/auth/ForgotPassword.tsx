import { useState, type FormEvent } from 'react';
import { translate, type Locale, type MessageKey } from '../i18n/messages';

export interface ForgotPasswordResult {
  error: { message: string } | null;
}

export interface ForgotPasswordProps {
  onSubmit: (email: string) => Promise<ForgotPasswordResult>;
  onBack: () => void;
  locale?: Locale;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function ForgotPassword({ onSubmit, onBack, locale = 'zh-CN' }: ForgotPasswordProps) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = (key: MessageKey) => translate(locale, key);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!isValidEmail(email)) {
      setError(t('forgot.invalidEmail'));
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: resultError } = await onSubmit(email.trim());
    if (resultError) {
      setError(t('forgot.failed'));
      setSubmitting(false);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <main className="auth-status">
        <h1>{t('forgot.sentTitle')}</h1>
        <p>{t('forgot.sentDescription')}</p>
        <div className="auth-status__actions">
          <button className="button button--primary" type="button" onClick={onBack}>{t('forgot.backToSignIn')}</button>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-login">
      <div className="auth-login__brand">瞬谱光电 · TIME-TECH SPECTRA</div>
      <h1 className="auth-login__title">{t('forgot.title')}</h1>
      <p className="auth-login__subtitle">{t('forgot.description')}</p>
      <form className="auth-login__form" onSubmit={handleSubmit} noValidate>
        <label className="auth-login__field" htmlFor="forgot-email">
          <span>{t('auth.email')}</span>
          <input
            id="forgot-email"
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => { setEmail(event.target.value); setError(null); }}
            required
            disabled={submitting}
          />
        </label>
        {error ? <p className="form-error auth-login__error" role="alert">{error}</p> : null}
        <button className="button button--primary auth-login__submit" type="submit" disabled={submitting}>
          {submitting ? t('forgot.submitting') : t('forgot.submit')}
        </button>
      </form>
      <p className="auth-login__register">
        <button type="button" className="text-button" onClick={onBack}>{t('forgot.backToSignIn')}</button>
      </p>
    </main>
  );
}
