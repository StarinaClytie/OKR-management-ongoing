import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissionService';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { mockData } from '../mocks/repository';
import { useLocale } from '../i18n/LocaleProvider';

export function WeeklyReportsPage() {
  const { t } = useLocale();
  const { currentUser } = useAuth();
  if (!currentUser) return null;
  const reports = mockData.weeklyReports.filter(
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
