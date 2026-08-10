import { PermissionGate } from '../../auth/PermissionGate';
import { can } from '../../auth/permissionService';
import { ConfidentialityBadge } from '../../components/ConfidentialityBadge';
import { MetricCard } from '../../components/MetricCard';
import { RestrictedContent } from '../../components/RestrictedContent';
import { StatusBadge } from '../../components/StatusBadge';
import type { DashboardData } from '../../mocks/repository';

export interface CompanyHealthWidgetProps {
  data: DashboardData;
}

export function CompanyHealthWidget({ data }: CompanyHealthWidgetProps) {
  const visibleProjects = data.projects.filter((project) => can(data.currentUser, 'okr.read_detail', project).allowed);
  const visibleProjectIds = new Set(visibleProjects.map((project) => project.id));
  const visibleObjectives = data.objectives.filter((objective) => can(data.currentUser, 'okr.read_detail', objective).allowed);
  const visibleRisks = data.risks.filter(
    (risk) => risk.classification !== 'restricted' && visibleProjectIds.has(risk.projectId),
  );
  const averageProgress = visibleObjectives.length === 0
    ? 0
    : Math.round(visibleObjectives.reduce((total, objective) => total + objective.progress, 0) / visibleObjectives.length);
  const risksNeedingAttention = visibleRisks.filter((risk) => risk.status === 'at_risk' || risk.status === 'off_track').length;

  return (
    <section className="dashboard-widget dashboard-widget--wide" aria-labelledby="company-health-title">
      <div className="dashboard-widget__header">
        <div>
          <p className="dashboard-widget__eyebrow">组织目标</p>
          <h2 id="company-health-title">公司 OKR 健康度</h2>
        </div>
      </div>
      <div className="dashboard-metrics">
        <MetricCard label="目标平均进度" value={`${averageProgress}%`} detail={`${visibleObjectives.length} 个目标`} />
        <MetricCard label="需关注风险" value={risksNeedingAttention} detail="含存在风险和已偏离" />
        <MetricCard label="正常推进项目" value={visibleProjects.filter((project) => project.status === 'on_track').length} detail={`共 ${visibleProjects.length} 个项目`} />
      </div>
      <div className="dashboard-list" aria-label="目标健康列表">
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
                <span>{objective.progress}% 完成</span>
              </div>
              <div className="objective-row__status">
                <ConfidentialityBadge classification={objective.classification} />
                <StatusBadge status={objective.status} />
              </div>
            </article>
          </PermissionGate>
        ))}
      </div>
    </section>
  );
}
