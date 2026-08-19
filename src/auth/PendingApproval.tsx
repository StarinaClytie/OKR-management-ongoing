import { useState } from 'react';
import { translate, type Locale, type MessageKey } from '../i18n/messages';

export interface PendingApprovalProps {
  email?: string;
  onRefresh: () => Promise<void>;
  onSignOut: () => void;
  locale?: Locale;
}

export function PendingApproval({ email, onRefresh, onSignOut, locale = 'zh-CN' }: PendingApprovalProps) {
  const [refreshing, setRefreshing] = useState(false);
  const t = (key: MessageKey) => translate(locale, key);

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <main className="auth-status">
      <h1>{t('pending.title')}</h1>
      <p>{t('pending.description')}</p>
      {email ? <p className="auth-status__email">{t('auth.email')}: {email}</p> : null}
      <div className="auth-status__actions">
        <button className="button button--primary" type="button" onClick={() => void handleRefresh()} disabled={refreshing}>
          {refreshing ? t('common.loading') : t('pending.refresh')}
        </button>
        <button className="button button--secondary" type="button" onClick={onSignOut}>{t('account.signOut')}</button>
      </div>
    </main>
  );
}
