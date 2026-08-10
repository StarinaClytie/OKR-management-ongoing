import type { ReactNode } from 'react';

export interface MetricCardProps {
  label: string;
  value: string | number;
  detail?: string;
  trend?: ReactNode;
}

export function MetricCard({ label, value, detail, trend }: MetricCardProps) {
  return (
    <section className="metric-card" aria-label={label}>
      <p className="metric-card__label">{label}</p>
      <p className="metric-card__value">{value}</p>
      {(detail || trend) && (
        <div className="metric-card__footer">
          {detail && <span>{detail}</span>}
          {trend}
        </div>
      )}
    </section>
  );
}
