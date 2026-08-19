import type { Role } from '../domain/types';
import type { MessageKey } from '../i18n/messages';

export type WidgetId =
  | 'today-focus'
  | 'my-key-results'
  | 'company-health'
  | 'report-review'
  | 'hr-summary'
  | 'admin-system';

export interface DashboardConfig {
  role: Role;
  titleKey: MessageKey;
  descriptionKey: MessageKey;
  widgetIds: readonly WidgetId[];
}
