import { Link } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleProvider';

export function AccessDeniedPage() {
  const { t } = useLocale();
  return (
    <section className="status-page" aria-labelledby="access-denied-title">
      <p className="status-page__eyebrow">{t('access.eyebrow')}</p>
      <h1 id="access-denied-title">{t('access.title')}</h1>
      <p>{t('access.description')}</p>
      <Link className="text-link" to="/dashboard">{t('common.backToDashboard')}</Link>
    </section>
  );
}
