import { useNavigate } from 'react-router-dom';
import { PermissionGate } from '../../auth/PermissionGate';
import { RestrictedContent } from '../../components/RestrictedContent';
import type { DashboardData } from '../../mocks/repository';
import { StatusBadge } from '../../components/StatusBadge';

export interface TodayFocusWidgetProps {
  data: DashboardData;
}

export function TodayFocusWidget({ data }: TodayFocusWidgetProps) {
  const navigate = useNavigate();
  const currentProjectIds = new Set(data.currentUser.projectIds);
  const nextMilestone = data.milestones
    .filter((milestone) => currentProjectIds.has(milestone.projectId))
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate))[0];

  return (
    <section className="dashboard-widget dashboard-widget--focus" aria-labelledby="today-focus-title">
      <div className="dashboard-widget__header">
        <div>
          <p className="dashboard-widget__eyebrow">今天</p>
          <h2 id="today-focus-title">今日重点</h2>
        </div>
        <button className="button button--primary" type="button" onClick={() => navigate('/daily-reports')}>
          填写今日日报
        </button>
      </div>
      {nextMilestone ? (
        <PermissionGate
          action="milestone.read"
          resource={nextMilestone}
          fallback={<RestrictedContent classification={nextMilestone.classification} />}
        >
          <div className="focus-item">
            <div>
              <strong>下一检查节点</strong>
              <p>{nextMilestone.title}</p>
            </div>
            <div className="focus-item__meta">
              <span>{nextMilestone.dueDate}</span>
              <StatusBadge status={nextMilestone.status} />
            </div>
          </div>
        </PermissionGate>
      ) : (
        <p className="dashboard-widget__muted">当前没有临近的项目节点。</p>
      )}
    </section>
  );
}
