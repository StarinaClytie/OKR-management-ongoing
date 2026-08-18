import type { ProjectStatus } from '../domain/types';
import { useLocale } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';

const statusLabels: Record<ProjectStatus, MessageKey> = {
  planned: 'status.planned',
  active: 'status.active',
  on_hold: 'status.onHold',
  completed: 'status.completed',
  archived: 'status.archived',
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const { t } = useLocale();
  return <span className={`status-badge status-badge--${status}`}>{t(statusLabels[status])}</span>;
}
