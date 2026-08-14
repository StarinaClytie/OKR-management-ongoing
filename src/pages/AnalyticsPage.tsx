import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissionService';
import { DataTable } from '../components/DataTable';
import { MetricCard } from '../components/MetricCard';
import { PageHeader } from '../components/PageHeader';
import { useLocale } from '../i18n/LocaleProvider';
import type { OkrRepository } from '../data/types';
import { useDashboardData } from '../data/useDashboardData';
import { repository } from '../lib/supabase';
import { RepositoryDataState } from '../components/RepositoryDataState';

export function AnalyticsPage({ dataRepository = repository }: { dataRepository?: OkrRepository }) {
  const { t } = useLocale();
  const { currentUser } = useAuth();
  const dashboard = useDashboardData(dataRepository, currentUser?.id);
  if (!currentUser) return null;
  if (dashboard.status !== 'ready') {
    return <section className="business-page" aria-labelledby="analytics-page-title"><PageHeader title={t('analytics.title')} description={t('analytics.description')} /><RepositoryDataState state={dashboard} /></section>;
  }
  const data = dashboard.data;
  const workloads = data.workloads.filter((workload) => can(currentUser, 'worklog.read_hours', workload).allowed);
  const totalLoggedHours = workloads.reduce((total, workload) => total + workload.loggedHours, 0);
  const totalCapacity = workloads.reduce((total, workload) => total + workload.capacityHours, 0);

  return (
    <section className="business-page" aria-labelledby="analytics-page-title">
      <PageHeader title={t('analytics.title')} description={t('analytics.description')} />
      <div className="metric-row"><MetricCard label={t('analytics.loggedHours')} value={`${totalLoggedHours}h`} detail={t('analytics.authorizedScope')} /><MetricCard label={t('analytics.capacity')} value={`${totalCapacity}h`} detail={t('analytics.currentPeriod')} /></div>
      <DataTable
        ariaLabel={t('analytics.authorized')}
        rows={workloads}
        getRowKey={(workload) => workload.id}
        emptyMessage={t('analytics.empty')}
        columns={[
          { key: 'member', label: t('table.member'), render: (workload) => data.users.find((user) => user.id === workload.userId)?.name ?? '—' },
          { key: 'planned', label: t('analytics.plannedHours'), render: (workload) => t('common.hours', { count: workload.plannedHours }) },
          { key: 'logged', label: t('analytics.loggedHoursColumn'), render: (workload) => t('common.hours', { count: workload.loggedHours }) },
          { key: 'capacity', label: t('analytics.capacityColumn'), render: (workload) => t('common.hours', { count: workload.capacityHours }) },
        ]}
      />
    </section>
  );
}
