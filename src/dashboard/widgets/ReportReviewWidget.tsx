import { PermissionGate } from '../../auth/PermissionGate';
import { RestrictedContent } from '../../components/RestrictedContent';
import { StatusBadge } from '../../components/StatusBadge';
import type { DashboardData } from '../../mocks/repository';
import { dailyReports } from '../../mocks/reports';
import { users } from '../../mocks/users';

export interface ReportReviewWidgetProps {
  data: DashboardData;
}

export function ReportReviewWidget({ data }: ReportReviewWidgetProps) {
  const projectIds = new Set(data.currentUser.projectIds);
  const memberReports = dailyReports.filter(
    (report) => report.authorId !== data.currentUser.id && projectIds.has(report.projectId) && report.status === 'submitted',
  );

  return (
    <section className="dashboard-widget" aria-labelledby="report-review-title">
      <div className="dashboard-widget__header">
        <div>
          <p className="dashboard-widget__eyebrow">项目协作</p>
          <h2 id="report-review-title">成员日报待审核</h2>
        </div>
        <span className="dashboard-widget__count">{memberReports.length} 份</span>
      </div>
      <div className="dashboard-list">
        {memberReports.map((report) => {
          const author = users.find((candidate) => candidate.id === report.authorId);

          return (
            <PermissionGate
              key={report.id}
              action="daily_report.read_body"
              resource={report}
              fallback={<RestrictedContent classification={report.classification} />}
            >
              <article className="report-row">
                <div>
                  <strong>{author?.name ?? '项目成员'} · {report.date}</strong>
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
