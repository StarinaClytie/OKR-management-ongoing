import { useAuth } from '../auth/AuthContext';
import { roleLabels } from '../auth/roleLabels';
import { PageHeader } from '../components/PageHeader';
import { useLocale } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';

export function ProfilePage() {
  const { t } = useLocale();
  const { currentUser, email } = useAuth();

  if (!currentUser) return null;

  const rows: ReadonlyArray<{ key: MessageKey; value: string }> = [
    { key: 'profile.name', value: currentUser.name },
    { key: 'profile.email', value: email ?? '—' },
    { key: 'profile.role', value: t(roleLabels[currentUser.role]) },
    { key: 'profile.department', value: currentUser.department },
    { key: 'profile.jobTitle', value: currentUser.title },
    { key: 'profile.organization', value: currentUser.organization ?? '—' },
  ];

  return (
    <section className="business-page" aria-labelledby="profile-page-title">
      <PageHeader title={t('profile.title')} description={t('profile.description')} />
      <div className="form-card">
        <dl className="profile-list">
          {rows.map((row) => (
            <div className="profile-list__row" key={row.key}>
              <dt>{t(row.key)}</dt>
              <dd>{row.value || '—'}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
