import { useAuth } from '../auth/AuthContext';
import type { OkrRepository } from '../data/types';
import { useDashboardData } from '../data/useDashboardData';
import { repository } from '../lib/supabase';
import { RepositoryDataState } from '../components/RepositoryDataState';
import { DashboardGrid } from './DashboardGrid';
import { getDashboardConfig } from './dashboardRegistry';
import { useLocale } from '../i18n/LocaleProvider';

export function DashboardPage({ dataRepository = repository }: { dataRepository?: OkrRepository }) {
  const { t } = useLocale();
  const { currentUser } = useAuth();
  const dashboard = useDashboardData(dataRepository, currentUser?.id);

  if (!currentUser) {
    return (
      <section className="status-page" role="status">
        <h1>{t('dashboard.loadError')}</h1>
        <p>{t('dashboard.identityUnavailable')}</p>
      </section>
    );
  }

  const config = getDashboardConfig(currentUser.role);

  return (
    <section className={`dashboard-page dashboard-page--${currentUser.role}`} aria-labelledby="dashboard-title">
      <header className="dashboard-page__header">
        <div>
          <p className="dashboard-page__eyebrow">{currentUser.name} · {currentUser.department}</p>
          <h1 id="dashboard-title">{t(config.titleKey)}</h1>
          <p>{t(config.descriptionKey)}</p>
        </div>
      </header>
      {dashboard.status === 'ready'
        ? <DashboardGrid data={dashboard.data} widgetIds={config.widgetIds} />
        : <RepositoryDataState state={dashboard} />}
    </section>
  );
}
