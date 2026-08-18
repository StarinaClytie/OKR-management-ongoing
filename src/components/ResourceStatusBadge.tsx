import type { ResourceStatus } from '../domain/types';
import { useLocale } from '../i18n/LocaleProvider';
import { resourceStatusKeys } from './resourceLabels';

export function ResourceStatusBadge({ status }: { status: ResourceStatus }) {
  const { t } = useLocale();
  return <span className={`status-badge status-badge--${status}`}>{t(resourceStatusKeys[status])}</span>;
}
