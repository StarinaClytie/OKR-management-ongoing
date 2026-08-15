import type { DashboardLoadState } from '../data/useDashboardData';
import { useLocale } from '../i18n/LocaleProvider';
import { repositoryErrorKey } from '../i18n/repositoryErrors';

export function RepositoryDataState({ state }: { state: Exclude<DashboardLoadState, { status: 'ready' }> }) {
  const { t } = useLocale();
  if (state.status === 'loading') return <p role="status">{t('common.loading')}</p>;
  return <p role="alert">{t(repositoryErrorKey(state.errorCode))}</p>;
}
