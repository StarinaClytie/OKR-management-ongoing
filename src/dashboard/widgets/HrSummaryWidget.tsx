import { PermissionGate } from '../../auth/PermissionGate';
import { can } from '../../auth/permissionService';
import { MetricCard } from '../../components/MetricCard';
import type { DashboardData } from '../../data/types';
import { useLocale } from '../../i18n/LocaleProvider';

export interface HrSummaryWidgetProps {
  data: DashboardData;
}

export function HrSummaryWidget({ data }: HrSummaryWidgetProps) {
  const { t } = useLocale();
  const authorizedWorkloads = data.workloads.filter(
    (workload) => can(data.currentUser, 'worklog.read_hours', workload).allowed,
  );
  const totalLogged = authorizedWorkloads.reduce((sum, workload) => sum + workload.loggedHours, 0);

  return (
    <section className="dashboard-widget dashboard-widget--wide" aria-labelledby="hr-summary-title">
      <div className="dashboard-widget__header">
        <div>
          <p className="dashboard-widget__eyebrow">{t('hr.authorizedData')}</p>
          <h2 id="hr-summary-title">{t('hr.summary')}</h2>
        </div>
      </div>
      <div className="dashboard-metrics">
        <MetricCard label={t('hr.authorizedRecords')} value={authorizedWorkloads.length} detail={t('hr.fieldsOnly')} />
        <MetricCard label={t('daily.hours')} value={t('common.hours', { count: totalLogged })} detail={t('hr.logged')} />
      </div>
      <div className="workload-summary" aria-label={t('hr.authorizedList')}>
        {authorizedWorkloads.map((workload) => {
          const user = data.users.find((candidate) => candidate.id === workload.userId);
          return (
            <PermissionGate key={workload.id} action="worklog.read_hours" resource={workload}>
              <article className="workload-row">
                <div>
                  <strong>{user?.name ?? t('table.member')}</strong>
                  <span>{t('hr.period', { start: workload.periodStart, end: workload.periodEnd })}</span>
                </div>
                <dl>
                  <div><dt>{t('hr.logged')}</dt><dd>{t('common.hours', { count: workload.loggedHours })}</dd></div>
                </dl>
              </article>
            </PermissionGate>
          );
        })}
      </div>
    </section>
  );
}
