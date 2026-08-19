import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { RepositoryDataState } from '../components/RepositoryDataState';
import { ProjectVisualizationsWidget } from '../dashboard/widgets/ProjectVisualizationsWidget';
import type { OkrRepository } from '../data/types';
import { useDashboardData } from '../data/useDashboardData';
import { useLocale } from '../i18n/LocaleProvider';
import { repository } from '../lib/supabase';

export function AnalyticsPage({ dataRepository = repository }: { dataRepository?: OkrRepository }) {
  const { t } = useLocale();
  const { currentUser } = useAuth();
  const dashboard = useDashboardData(dataRepository, currentUser?.id);
  if (!currentUser) return null;
  if (dashboard.status !== 'ready') {
    return <section className="business-page" aria-labelledby="analytics-page-title"><PageHeader title={t('analytics.title')} description={t('analytics.description')} /><RepositoryDataState state={dashboard} /></section>;
  }

  return (
    <section className="business-page" aria-labelledby="analytics-page-title">
      <PageHeader title={t('analytics.title')} description={t('analytics.description')} />
      <ProjectVisualizationsWidget data={dashboard.data} />
    </section>
  );
}
