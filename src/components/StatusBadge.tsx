import type { ProgressStatus, ReportStatus } from '../domain/types';

const statusLabels: Record<ProgressStatus | ReportStatus, string> = {
  on_track: '正常推进',
  at_risk: '存在风险',
  off_track: '已偏离',
  complete: '已完成',
  draft: '草稿',
  submitted: '已提交',
  returned: '已退回',
  confirmed: '已确认',
};

export interface StatusBadgeProps {
  status: ProgressStatus | ReportStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`status-badge status-badge--${status}`}>{statusLabels[status]}</span>;
}
