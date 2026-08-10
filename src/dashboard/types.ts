import type { Role } from '../domain/types';

export type WidgetId =
  | 'today-focus'
  | 'my-key-results'
  | 'company-health'
  | 'report-review'
  | 'hr-summary'
  | 'admin-system'
  | 'project-visualizations';

export interface DashboardConfig {
  role: Role;
  title: string;
  description: string;
  widgetIds: readonly WidgetId[];
}
