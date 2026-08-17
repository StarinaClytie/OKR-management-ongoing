import { useState, type FormEvent } from 'react';

export interface SignInResult {
  error: { message: string } | null;
}

export interface LoginFormProps {
  signIn: (email: string, password: string) => Promise<SignInResult>;
}

function authErrorMessage(error: { message: string }): string {
  const message = error.message.toLowerCase();
  if (message.includes('invalid login credentials')) {
    return '邮箱或密码错误，请重试。';
  }
  if (message.includes('email not confirmed')) {
    return '邮箱尚未验证，请先完成邮箱验证。';
  }
  return '登录失败，请稍后重试。';
}

export function LoginForm({ signIn }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const { error } = await signIn(email, password);
    if (error) {
      setError(authErrorMessage(error));
      setSubmitting(false);
      return;
    }
    // On success the provider's onAuthStateChange listener transitions the session
    // and unmounts this form; keep `submitting` true until then to prevent a double submit.
  }

  return (
    <main className="auth-login">
      <div className="auth-login__brand">Northstar OKR</div>
      <h1 className="auth-login__title">登录 Northstar OKR</h1>
      <p className="auth-login__subtitle">请使用组织账户登录。</p>
      <form className="auth-login__form" onSubmit={handleSubmit} noValidate>
        <label className="auth-login__field" htmlFor="auth-email">
          <span>邮箱</span>
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
          <span>密码</span>
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
          {submitting ? '登录中…' : '登录'}
        </button>
      </form>
    </main>
  );
}
