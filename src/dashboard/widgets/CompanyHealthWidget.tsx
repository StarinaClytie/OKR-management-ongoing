import { PermissionGate } from '../../auth/PermissionGate';
import { can } from '../../auth/permissionService';
import { ConfidentialityBadge } from '../../components/ConfidentialityBadge';
import { MetricCard } from '../../components/MetricCard';
import { RestrictedContent } from '../../components/RestrictedContent';
import { StatusBadge } from '../../components/StatusBadge';
import type { DashboardData } from '../../data/types';
import { useLocale } from '../../i18n/LocaleProvider';
import { deriveExecutionStatuses } from '../../domain/progressStatus';
import { buildHourEntries } from './hoursFiltering';

export interface CompanyHealthWidgetProps {
  data: DashboardData;
}

export function CompanyHealthWidget({ data }: CompanyHealthWidgetProps) {
  const { t } = useLocale();
  const visibleProjects = data.projects.filter((project) => can(data.currentUser, 'okr.read_detail', project).allowed);
  const visibleObjectives = data.objectives.filter((objective) => can(data.currentUser, 'okr.read_detail', objective).allowed);
  const visibleObjectiveIds = new Set(visibleObjectives.map((objective) => objective.id));
  const visibleKeyResults = data.keyResults.filter((keyResult) =>
    visibleObjectiveIds.has(keyResult.objectiveId) && can(data.currentUser, 'okr.read_detail', keyResult).allowed,
  );
  const executionStatuses = deriveExecutionStatuses({ ...data, risks: [] });
  const objectiveProgress = visibleObjectives.length === 0
    ? 0
    : Math.round(visibleObjectives.reduce((total, objective) => total + objective.progress, 0) / visibleObjectives.length);
  const keyResultProgress = visibleKeyResults.length === 0
    ? 0
    : Math.round(visibleKeyResults.reduce((total, keyResult) => total + keyResult.progress, 0) / visibleKeyResults.length);
  const projectProgress = visibleProjects.length === 0
    ? 0
    : Math.round(visibleProjects.reduce((total, project) => {
        const objectives = visibleObjectives.filter((objective) => objective.projectId === project.id);
        return total + (objectives.length === 0 ? 0 : objectives.reduce((sum, objective) => sum + objective.progress, 0) / objectives.length);
      }, 0) / visibleProjects.length);
  const recordedHours = buildHourEntries(data).reduce((total, entry) => total + entry.hours, 0);

  return (
    <section className="dashboard-widget dashboard-widget--wide" aria-labelledby="company-health-title">
      <div className="dashboard-widget__header">
        <div>
          <p className="dashboard-widget__eyebrow">{t('company.objectives')}</p>
          <h2 id="company-health-title">{t('company.health')}</h2>
        </div>
      </div>
      <div className="dashboard-metrics">
        <MetricCard label={t('company.objectiveCompletion')} value={`${objectiveProgress}%`} detail={t('company.objectiveCount', { count: visibleObjectives.length })} />
        <MetricCard label={t('company.krCompletion')} value={`${keyResultProgress}%`} detail={t('company.krCount', { count: visibleKeyResults.length })} />
        <MetricCard label={t('company.recordedHours')} value={t('common.hours', { count: recordedHours })} detail={t('company.employeeHoursDetail')} />
        <MetricCard label={t('company.projectProgress')} value={`${projectProgress}%`} detail={t('company.projectCount', { count: visibleProjects.length })} />
      </div>
      <div className="dashboard-list" aria-label={t('company.healthList')}>
        {visibleObjectives.map((objective) => (
          <PermissionGate
            key={objective.id}
            action="okr.read_detail"
            resource={objective}
            fallback={<RestrictedContent classification={objective.classification} />}
          >
            <article className="objective-row">
              <div>
                <strong>{objective.title}</strong>
                <span>{t('common.percentComplete', { progress: objective.progress })}</span>
                <span>{t('company.projectLeader', { name: data.users.find((user) => user.id === data.projects.find((project) => project.id === objective.projectId)?.leaderId)?.name ?? t('table.member') })}</span>
              </div>
              <div className="objective-row__status">
                <ConfidentialityBadge classification={objective.classification} />
                <StatusBadge status={executionStatuses.objectives.get(objective.id)?.status ?? objective.status} />
              </div>
            </article>
          </PermissionGate>
        ))}
      </div>
    </section>
  );
}
