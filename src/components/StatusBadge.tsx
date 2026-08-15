import type { ProgressStatus, ReportStatus } from '../domain/types';
import { useLocale } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';

const statusLabels: Record<ProgressStatus | ReportStatus, MessageKey> = {
  on_track: 'status.onTrack',
  at_risk: 'status.atRisk',
  off_track: 'status.offTrack',
  complete: 'status.complete',
  draft: 'status.draft',
  submitted: 'status.submitted',
  returned: 'status.returned',
  confirmed: 'status.confirmed',
};

export interface StatusBadgeProps {
  status: ProgressStatus | ReportStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useLocale();
  return <span className={`status-badge status-badge--${status}`}>{t(statusLabels[status])}</span>;
}
