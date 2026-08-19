import { PermissionGate } from '../../auth/PermissionGate';
import { can } from '../../auth/permissionService';
import { RestrictedContent } from '../../components/RestrictedContent';
import { StatusBadge } from '../../components/StatusBadge';
import type { DashboardData } from '../../data/types';
import { useLocale } from '../../i18n/LocaleProvider';

export interface ReportReviewWidgetProps {
  data: DashboardData;
}

export function ReportReviewWidget({ data }: ReportReviewWidgetProps) {
  const { t } = useLocale();
  const projectIds = new Set(data.currentUser.projectIds);
  const memberReports = data.dailyReports.filter(
    (report) =>
      report.authorId !== data.currentUser.id &&
      projectIds.has(report.projectId) &&
      report.status === 'submitted' &&
      can(data.currentUser, 'daily_report.read_body', report).allowed,
  );

  return (
    <section className="dashboard-widget" aria-labelledby="report-review-title">
      <div className="dashboard-widget__header">
        <div>
          <p className="dashboard-widget__eyebrow">{t('review.eyebrow')}</p>
          <h2 id="report-review-title">{t('review.title')}</h2>
        </div>
        <span className="dashboard-widget__count">{t('review.count', { count: memberReports.length })}</span>
      </div>
      <div className="dashboard-list">
        {memberReports.map((report) => {
          const author = data.users.find((candidate) => candidate.id === report.authorId);

          return (
            <PermissionGate
              key={report.id}
              action="daily_report.read_body"
              resource={report}
              fallback={<RestrictedContent classification={report.classification} />}
            >
              <article className="report-row">
                <div>
                  <strong>{author?.name ?? t('review.projectMember')} · {report.date}</strong>
                  <p>{report.content}</p>
                </div>
                <StatusBadge status={report.status} />
              </article>
            </PermissionGate>
          );
        })}
      </div>
    </section>
  );
}
