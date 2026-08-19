import { PermissionGate } from '../../auth/PermissionGate';
import { can } from '../../auth/permissionService';
import { ConfidentialityBadge } from '../../components/ConfidentialityBadge';
import { MetricCard } from '../../components/MetricCard';
import { RestrictedContent } from '../../components/RestrictedContent';
import { StatusBadge } from '../../components/StatusBadge';
import type { DashboardData } from '../../data/types';
import { useLocale } from '../../i18n/LocaleProvider';
import { deriveExecutionStatuses } from '../../domain/progressStatus';

export interface CompanyHealthWidgetProps {
  data: DashboardData;
}

export function CompanyHealthWidget({ data }: CompanyHealthWidgetProps) {
  const { t } = useLocale();
  const visibleProjects = data.projects.filter((project) => can(data.currentUser, 'okr.read_detail', project).allowed);
  const visibleProjectIds = new Set(visibleProjects.map((project) => project.id));
  const visibleObjectives = data.objectives.filter((objective) => can(data.currentUser, 'okr.read_detail', objective).allowed);
  const visibleRisks = data.risks.filter(
    (risk) => risk.classification !== 'restricted' && visibleProjectIds.has(risk.projectId),
  );
  const executionStatuses = deriveExecutionStatuses({ ...data, risks: visibleRisks });
  const averageProgress = visibleObjectives.length === 0
    ? 0
    : Math.round(visibleObjectives.reduce((total, objective) => total + objective.progress, 0) / visibleObjectives.length);
  const risksNeedingAttention = visibleRisks.filter((risk) => risk.status === 'at_risk' || risk.status === 'off_track').length;

  return (
    <section className="dashboard-widget dashboard-widget--wide" aria-labelledby="company-health-title">
      <div className="dashboard-widget__header">
        <div>
          <p className="dashboard-widget__eyebrow">{t('company.objectives')}</p>
          <h2 id="company-health-title">{t('company.health')}</h2>
        </div>
      </div>
      <div className="dashboard-metrics">
        <MetricCard label={t('company.averageProgress')} value={`${averageProgress}%`} detail={t('company.objectiveCount', { count: visibleObjectives.length })} />
        <MetricCard label={t('company.risks')} value={risksNeedingAttention} detail={t('company.riskDetail')} />
        <MetricCard label={t('company.onTrackProjects')} value={visibleProjects.filter((project) => project.status === 'on_track').length} detail={t('company.projectCount', { count: visibleProjects.length })} />
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
