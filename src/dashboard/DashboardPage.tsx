import { useAuth } from '../auth/AuthContext';
import { mockRepository } from '../mocks/repository';
import { DashboardGrid } from './DashboardGrid';
import { getDashboardConfig } from './dashboardRegistry';
import { useLocale } from '../i18n/LocaleProvider';

export function DashboardPage() {
  const { t } = useLocale();
  const { currentUser } = useAuth();

  if (!currentUser) {
    return (
      <section className="status-page" role="status">
        <h1>{t('dashboard.loadError')}</h1>
        <p>{t('dashboard.identityUnavailable')}</p>
      </section>
    );
  }

  const config = getDashboardConfig(currentUser.role);
  const data = mockRepository.getDashboardData(currentUser.id);

  return (
    <section className={`dashboard-page dashboard-page--${currentUser.role}`} aria-labelledby="dashboard-title">
      <header className="dashboard-page__header">
        <div>
          <p className="dashboard-page__eyebrow">{currentUser.name} · {currentUser.department}</p>
          <h1 id="dashboard-title">{t(config.titleKey)}</h1>
          <p>{t(config.descriptionKey)}</p>
        </div>
      </header>
      <DashboardGrid data={data} widgetIds={config.widgetIds} />
    </section>
  );
}
