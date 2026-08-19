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
  const overloadedCount = authorizedWorkloads.filter((workload) => workload.loggedHours > workload.capacityHours).length;

  return (
    <section className="dashboard-widget dashboard-widget--wide" aria-labelledby="hr-summary-title">
      <div className="dashboard-widget__header">
        <div>
          <p className="dashboard-widget__eyebrow">{t('hr.authorizedData')}</p>
          <h2 id="hr-summary-title">{t('hr.summary')}</h2>
        </div>
      </div>
      <div className="dashboard-metrics">
        <MetricCard label={t('hr.overloadedPeople')} value={overloadedCount} detail={t('hr.overloadDetail')} />
        <MetricCard label={t('hr.authorizedRecords')} value={authorizedWorkloads.length} detail={t('hr.fieldsOnly')} />
      </div>
      <div className="workload-summary" aria-label={t('hr.authorizedList')}>
        {authorizedWorkloads.map((workload) => {
          const user = data.users.find((candidate) => candidate.id === workload.userId);
          const overloaded = workload.loggedHours > workload.capacityHours;

          return (
            <PermissionGate key={workload.id} action="worklog.read_hours" resource={workload}>
              <article className="workload-row">
                <div>
                  <strong>{user?.name ?? t('table.member')}</strong>
                  <span>{t('hr.period', { start: workload.periodStart, end: workload.periodEnd })}</span>
                </div>
                <dl>
                  <div><dt>{t('hr.planned')}</dt><dd>{t('common.hours', { count: workload.plannedHours })}</dd></div>
                  <div><dt>{t('hr.logged')}</dt><dd>{t('common.hours', { count: workload.loggedHours })}</dd></div>
                  <div><dt>{t('hr.capacity')}</dt><dd>{t('common.hours', { count: workload.capacityHours })}</dd></div>
                </dl>
                <span className={overloaded ? 'workload-state workload-state--warning' : 'workload-state'}>
                  {overloaded ? t('hr.overloaded') : t('hr.normal')}
                </span>
              </article>
            </PermissionGate>
          );
        })}
      </div>
    </section>
  );
}
