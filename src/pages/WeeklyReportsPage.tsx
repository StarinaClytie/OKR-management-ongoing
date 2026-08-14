import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissionService';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { useLocale } from '../i18n/LocaleProvider';
import type { OkrRepository } from '../data/types';
import { useDashboardData } from '../data/useDashboardData';
import { repository } from '../lib/supabase';
import { RepositoryDataState } from '../components/RepositoryDataState';

export function WeeklyReportsPage({ dataRepository = repository }: { dataRepository?: OkrRepository }) {
  const { t } = useLocale();
  const { currentUser } = useAuth();
  const dashboard = useDashboardData(dataRepository, currentUser?.id);
  if (!currentUser) return null;
  if (dashboard.status !== 'ready') {
    return <section className="business-page" aria-labelledby="weekly-reports-page-title"><PageHeader title={t('weekly.title')} description={t('weekly.description')} /><RepositoryDataState state={dashboard} /></section>;
  }
  const reports = (dashboard.data.weeklyReports ?? []).filter(
    (report) =>
      can(currentUser, 'weekly_report.read', report).allowed &&
      can(currentUser, 'weekly_report.read_body', report).allowed,
  );

  return (
    <section className="business-page" aria-labelledby="weekly-reports-page-title">
      <PageHeader title={t('weekly.title')} description={t('weekly.description')} />
      <DataTable
        ariaLabel={t('weekly.authorized')}
        rows={reports}
        getRowKey={(report) => report.id}
        emptyMessage={t('weekly.empty')}
        columns={[
          { key: 'week', label: t('weekly.date'), render: (report) => report.weekEnding },
          { key: 'summary', label: t('weekly.summary'), render: (report) => report.summary },
          { key: 'plan', label: t('weekly.nextPlan'), render: (report) => report.nextWeekPlan },
          { key: 'status', label: t('table.status'), render: (report) => <StatusBadge status={report.status} /> },
        ]}
      />
    </section>
  );
}
