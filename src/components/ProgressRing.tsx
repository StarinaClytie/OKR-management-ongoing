export interface ProgressRingProps {
  value: number;
  label?: string;
  size?: 'small' | 'medium';
}

export function ProgressRing({ value, label = '完成进度', size = 'medium' }: ProgressRingProps) {
  const progress = Math.max(0, Math.min(100, Math.round(value)));
  const accessibleLabel = `${label} ${progress}%`;

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
