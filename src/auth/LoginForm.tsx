import { useState, type FormEvent } from 'react';
import { translate, type Locale, type MessageKey } from '../i18n/messages';

export interface SignInResult {
  error: { message: string } | null;
}

export interface LoginFormProps {
  signIn: (email: string, password: string) => Promise<SignInResult>;
  onRegister?: () => void;
  locale?: Locale;
}

function authErrorMessage(error: { message: string }, t: (key: MessageKey) => string): string {
  const message = error.message.toLowerCase();
  if (message.includes('invalid login credentials')) {
    return t('auth.invalidCredentials');
  }
  if (message.includes('email not confirmed')) {
    return t('auth.emailNotConfirmed');
  }
  return t('auth.failed');
}

export function LoginForm({ signIn, onRegister, locale = 'zh-CN' }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = (key: MessageKey) => translate(locale, key);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const { error } = await signIn(email, password);
    if (error) {
      setError(authErrorMessage(error, t));
      setSubmitting(false);
      return;
    }
    // On success the provider's onAuthStateChange listener transitions the session
    // and unmounts this form; keep `submitting` true until then to prevent a double submit.
  }

  return (
    <main className="auth-login">
      <div className="auth-login__brand">瞬谱光电 · TIME-TECH SPECTRA</div>
      <h1 className="auth-login__title">{t('auth.signIn')}</h1>
      <p className="auth-login__subtitle">{t('auth.signInDescription')}</p>
      <form className="auth-login__form" onSubmit={handleSubmit} noValidate>
        <label className="auth-login__field" htmlFor="auth-email">
          <span>{t('auth.email')}</span>
          <input
            id="auth-email"
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            disabled={submitting}
          />
        </label>
        <label className="auth-login__field" htmlFor="auth-password">
          <span>{t('auth.password')}</span>
          <input
            id="auth-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={submitting}
          />
        </label>
        {error ? <p className="form-error auth-login__error" role="alert">{error}</p> : null}
        <button className="button button--primary auth-login__submit" type="submit" disabled={submitting}>
          {submitting ? t('auth.submitting') : t('auth.submit')}
        </button>
      </form>
      {onRegister ? (
        <p className="auth-login__register">
          <button type="button" className="text-button" onClick={onRegister}>{t('auth.noAccount')}</button>
        </p>
      ) : null}
    </main>
  );
}
