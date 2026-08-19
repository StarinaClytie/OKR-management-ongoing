import { useState, type FormEvent } from 'react';
import { translate, type Locale, type MessageKey } from '../i18n/messages';
import type { SignUpResult } from './AuthContext';

export interface RegisterFormProps {
  onSubmit: (displayName: string, email: string, password: string) => Promise<SignUpResult>;
  onBack: () => void;
  locale?: Locale;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function registerErrorMessage(error: { message: string }, t: (key: MessageKey) => string): string {
  const message = error.message.toLowerCase();
  if (message.includes('already') && (message.includes('registered') || message.includes('user'))) {
    return t('register.emailInUse');
  }
  if (message.includes('password')) return t('register.passwordTooShort');
  if (message.includes('email')) return t('register.invalidEmail');
  return t('register.failed');
}

export function RegisterForm({ onSubmit, onBack, locale = 'zh-CN' }: RegisterFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = (key: MessageKey) => translate(locale, key);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (name.trim() === '') {
      setError(t('register.nameRequired'));
      return;
    }
    if (!isValidEmail(email)) {
      setError(t('register.invalidEmail'));
      return;
    }
    if (password.length < 6) {
      setError(t('register.passwordTooShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('register.passwordMismatch'));
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: resultError } = await onSubmit(name.trim(), email.trim(), password);
    if (resultError) {
      setError(registerErrorMessage(resultError, t));
      setSubmitting(false);
      return;
    }
    // On success the provider transitions to the pending-approval screen and
    // unmounts this form; keep `submitting` true to prevent a double submit.
  }

  return (
    <main className="auth-login">
      <div className="auth-login__brand">Northstar OKR</div>
      <h1 className="auth-login__title">{t('register.title')}</h1>
      <p className="auth-login__subtitle">{t('register.subtitle')}</p>
      <form className="auth-login__form" onSubmit={handleSubmit} noValidate>
        <label className="auth-login__field" htmlFor="register-name">
          <span>{t('register.name')}</span>
          <input id="register-name" name="name" type="text" autoComplete="name" value={name} onChange={(event) => { setName(event.target.value); setError(null); }} required disabled={submitting} />
        </label>
        <label className="auth-login__field" htmlFor="register-email">
          <span>{t('register.email')}</span>
          <input id="register-email" name="email" type="email" autoComplete="username" value={email} onChange={(event) => { setEmail(event.target.value); setError(null); }} required disabled={submitting} />
        </label>
        <label className="auth-login__field" htmlFor="register-password">
          <span>{t('register.password')}</span>
          <input id="register-password" name="password" type="password" autoComplete="new-password" value={password} onChange={(event) => { setPassword(event.target.value); setError(null); }} required disabled={submitting} />
        </label>
        <label className="auth-login__field" htmlFor="register-confirm">
          <span>{t('register.confirmPassword')}</span>
          <input id="register-confirm" name="confirmPassword" type="password" autoComplete="new-password" value={confirm} onChange={(event) => { setConfirm(event.target.value); setError(null); }} required disabled={submitting} />
        </label>
        {error ? <p className="form-error auth-login__error" role="alert">{error}</p> : null}
        <button className="button button--primary auth-login__submit" type="submit" disabled={submitting}>
          {submitting ? t('register.submitting') : t('register.submit')}
        </button>
      </form>
      <p className="auth-login__register">
        <button type="button" className="text-button" onClick={onBack}>{t('register.haveAccount')}</button>
      </p>
    </main>
  );
}
