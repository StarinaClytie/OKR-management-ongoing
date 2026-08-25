import { translate, type Locale, type MessageKey } from '../i18n/messages';

export interface EmailVerificationPendingProps {
  email?: string;
  onBack: () => void;
  locale?: Locale;
}

export function EmailVerificationPending({ email, onBack, locale = 'zh-CN' }: EmailVerificationPendingProps) {
  const t = (key: MessageKey) => translate(locale, key);

  return (
    <main className="auth-status">
      <h1>{t('verify.title')}</h1>
      <p>{t('verify.description')}</p>
      {email ? <p className="auth-status__email">{t('auth.email')}: {email}</p> : null}
      <div className="auth-status__actions">
        <button className="button button--primary" type="button" onClick={onBack}>{t('verify.backToSignIn')}</button>
      </div>
    </main>
  );
}
