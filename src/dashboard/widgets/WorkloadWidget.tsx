import type { DashboardData } from '../../mocks/repository';
import { prepareVisualizationData } from './visualizationData';
import { useLocale } from '../../i18n/LocaleProvider';

export interface WorkloadWidgetProps {
  data: DashboardData;
}

export function WorkloadWidget({ data }: WorkloadWidgetProps) {
  const { t } = useLocale();
  const { workloads } = prepareVisualizationData(data, { unknownMember: t('table.member') });

  if (workloads.length === 0) {
    return <p className="visualization-empty">{t('workload.empty')}</p>;
  }

  return (
    <div className="workload-visualization">
      <div className="workload-visualization__legend" aria-label={t('workload.legend')}>
        <span>{t('workload.planned')}</span><span>{t('workload.logged')}</span><span>{t('workload.capacity')}</span>
      </div>
      {workloads.map((workload) => {
        const scale = Math.max(workload.capacityHours, workload.loggedHours, workload.plannedHours, 1);
        return (
          <article className="workload-card" key={workload.id}>
            <div className="workload-card__heading">
              <strong>{workload.memberName}</strong>
              <span className={workload.overloaded ? 'workload-state workload-state--warning' : 'workload-state'}>
                {workload.overloaded ? t('hr.overloaded') : t('hr.normal')}
              </span>
            </div>
            <dl>
              <div>
                <dt>{t('workload.planned')}</dt><dd>{t('common.hours', { count: workload.plannedHours })}</dd>
                <span className="workload-bar"><i style={{ width: `${workload.plannedHours / scale * 100}%` }} /></span>
              </div>
              <div>
                <dt>{t('workload.logged')}</dt><dd>{t('common.hours', { count: workload.loggedHours })}</dd>
                <span className={workload.overloaded ? 'workload-bar workload-bar--warning' : 'workload-bar'}>
                  <i style={{ width: `${workload.loggedHours / scale * 100}%` }} />
                </span>
              </div>
              <div>
                <dt>{t('workload.capacity')}</dt><dd>{t('common.hours', { count: workload.capacityHours })}</dd>
                <span className="workload-bar workload-bar--capacity"><i style={{ width: `${workload.capacityHours / scale * 100}%` }} /></span>
              </div>
            </dl>
          </article>
        );
      })}
      {data.currentUser.role === 'hr' ? (
        <p className="dashboard-widget__notice">{t('workload.hrNotice')}</p>
      ) : null}
    </div>
  );
}
