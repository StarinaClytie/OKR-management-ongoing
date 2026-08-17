export interface ProgressRingProps {
  value: number;
  label?: string;
  size?: 'small' | 'medium';
}

import { useLocale } from '../i18n/LocaleProvider';

export function ProgressRing({ value, label, size = 'medium' }: ProgressRingProps) {
  const { t } = useLocale();
  const progress = Math.max(0, Math.min(100, Math.round(value)));
  const accessibleLabel = `${label ?? t('progress.label')} ${progress}%`;

  return (
    <div
      className={`progress-ring progress-ring--${size}`}
      role="progressbar"
      aria-label={accessibleLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
      style={{ '--progress': `${progress}%` } as React.CSSProperties}
    >
      <span aria-hidden="true">{progress}%</span>
    </div>
  );
}
