import { WidgetErrorBoundary } from '../components/WidgetErrorBoundary';
import type { DashboardData } from '../data/types';
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
      return <AdminSystemWidget data={data} />;
  }
}

export function DashboardGrid({ data, widgetIds }: DashboardGridProps) {
  return (
    <div className="dashboard-grid dashboard-grid--responsive">
      {widgetIds.map((widgetId) => (
        <WidgetErrorBoundary key={widgetId}>{renderWidget(widgetId, data)}</WidgetErrorBoundary>
      ))}
    </div>
  );
}
