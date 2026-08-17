import type { Classification } from '../domain/types';
import { useLocale } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';

const classificationLabels: Record<Classification, MessageKey> = {
  public: 'classification.public',
  internal: 'classification.internal',
  confidential: 'classification.confidential',
  restricted: 'classification.restricted',
};

export interface ConfidentialityBadgeProps {
  classification: Classification;
}

export function ConfidentialityBadge({ classification }: ConfidentialityBadgeProps) {
  const { t } = useLocale();
  return <span className={`confidentiality-badge confidentiality-badge--${classification}`}>{t(classificationLabels[classification])}</span>;
}
