import { Link } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleProvider';

export function NotFoundPage() {
  const { t } = useLocale();
  return (
    <section className="status-page" aria-labelledby="not-found-title">
      <p className="status-page__eyebrow">{t('notFound.eyebrow')}</p>
      <h1 id="not-found-title">{t('notFound.title')}</h1>
      <p>{t('notFound.description')}</p>
      <Link className="text-link" to="/dashboard">{t('common.backToDashboard')}</Link>
    </section>
  );
}
