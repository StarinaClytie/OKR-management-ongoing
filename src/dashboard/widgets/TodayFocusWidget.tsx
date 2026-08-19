import { useNavigate } from 'react-router-dom';
import { PermissionGate } from '../../auth/PermissionGate';
import { RestrictedContent } from '../../components/RestrictedContent';
import type { DashboardData } from '../../data/types';
import { StatusBadge } from '../../components/StatusBadge';
import { useLocale } from '../../i18n/LocaleProvider';

export interface TodayFocusWidgetProps {
  data: DashboardData;
}

export function TodayFocusWidget({ data }: TodayFocusWidgetProps) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const currentProjectIds = new Set(data.currentUser.projectIds);
  const nextMilestone = data.milestones
    .filter((milestone) => currentProjectIds.has(milestone.projectId))
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate))[0];

  return (
    <section className="dashboard-widget dashboard-widget--focus" aria-labelledby="today-focus-title">
      <div className="dashboard-widget__header">
        <div>
          <p className="dashboard-widget__eyebrow">{t('focus.today')}</p>
          <h2 id="today-focus-title">{t('focus.title')}</h2>
        </div>
        <button className="button button--primary" type="button" onClick={() => navigate('/reports?tab=daily')}>
          {t('focus.report')}
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
              <strong>{t('focus.nextMilestone')}</strong>
              <p>{nextMilestone.title}</p>
            </div>
            <div className="focus-item__meta">
              <span>{nextMilestone.dueDate}</span>
              <StatusBadge status={nextMilestone.status} />
            </div>
          </div>
        </PermissionGate>
      ) : (
        <p className="dashboard-widget__muted">{t('focus.empty')}</p>
      )}
    </section>
  );
}
