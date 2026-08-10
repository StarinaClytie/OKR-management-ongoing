import { WidgetErrorBoundary } from '../components/WidgetErrorBoundary';
import type { DashboardData } from '../mocks/repository';
import type { WidgetId } from './types';
import { AdminSystemWidget } from './widgets/AdminSystemWidget';
import { CompanyHealthWidget } from './widgets/CompanyHealthWidget';
import { HrSummaryWidget } from './widgets/HrSummaryWidget';
import { MyKeyResultsWidget } from './widgets/MyKeyResultsWidget';
import { ReportReviewWidget } from './widgets/ReportReviewWidget';
import { TodayFocusWidget } from './widgets/TodayFocusWidget';

export interface DashboardGridProps {
  data: DashboardData;
  widgetIds: readonly WidgetId[];
}

function ProjectVisualizationsPreview() {
  return (
    <section className="dashboard-widget dashboard-widget--wide" aria-labelledby="project-views-title">
      <div className="dashboard-widget__header">
        <div>
          <p className="dashboard-widget__eyebrow">按需展开</p>
          <h2 id="project-views-title">项目专业视图</h2>
        </div>
      </div>
      <p className="dashboard-widget__muted">对齐、进度、风险和负载视图将在此集中切换，默认不占满首屏。</p>
    </section>
  );
}

function renderWidget(widgetId: WidgetId, data: DashboardData) {
  switch (widgetId) {
    case 'today-focus':
      return <TodayFocusWidget data={data} />;
    case 'my-key-results':
      return <MyKeyResultsWidget data={data} />;
    case 'company-health':
      return <CompanyHealthWidget data={data} />;
    case 'report-review':
      return <ReportReviewWidget data={data} />;
    case 'hr-summary':
      return <HrSummaryWidget data={data} />;
    case 'admin-system':
      return <AdminSystemWidget />;
    case 'project-visualizations':
      return <ProjectVisualizationsPreview />;
  }
}

export function DashboardGrid({ data, widgetIds }: DashboardGridProps) {
  return (
    <div className="dashboard-grid">
      {widgetIds.map((widgetId) => (
        <WidgetErrorBoundary key={widgetId}>{renderWidget(widgetId, data)}</WidgetErrorBoundary>
      ))}
    </div>
  );
}
