import type { OkrStatus } from '../domain/types';
import { useLocale } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';

const statusKeys: Record<OkrStatus, MessageKey> = {
  not_started: 'okrStatus.notStarted',
  on_track: 'okrStatus.onTrack',
  at_risk: 'okrStatus.atRisk',
  delayed: 'okrStatus.delayed',
  completed: 'okrStatus.completed',
};

export function OkrStatusBadge({ status }: { status: OkrStatus }) {
  const { t } = useLocale();
  return <span className={`status-badge okr-status-badge okr-status-badge--${status}`}>{t(statusKeys[status])}</span>;
}
