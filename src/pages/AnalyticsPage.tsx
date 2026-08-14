import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissionService';
import { DataTable } from '../components/DataTable';
import { MetricCard } from '../components/MetricCard';
import { PageHeader } from '../components/PageHeader';
import { mockRepository } from '../mocks/repository';
import { useLocale } from '../i18n/LocaleProvider';

export function AnalyticsPage() {
  const { t } = useLocale();
  const { currentUser } = useAuth();
  if (!currentUser) return null;
  const data = mockRepository.getDashboardData(currentUser.id);
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
