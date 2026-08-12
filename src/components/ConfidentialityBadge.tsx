import type { Classification } from '../domain/types';

const classificationLabels: Record<Classification, string> = {
  public: '公开',
  internal: '内部',
  confidential: '机密',
  restricted: '严格机密',
};

export interface ConfidentialityBadgeProps {
  classification: Classification;
}

export function ConfidentialityBadge({ classification }: ConfidentialityBadgeProps) {
  return <span className={`confidentiality-badge confidentiality-badge--${classification}`}>{classificationLabels[classification]}</span>;
}
