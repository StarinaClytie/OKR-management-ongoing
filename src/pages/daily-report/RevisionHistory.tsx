export interface RevisionSummary { revision: number; createdAt: string; editorName: string }
import { useLocale } from '../../i18n/LocaleProvider';

export function RevisionHistory({ revisions }: { revisions: RevisionSummary[] }) {
  const { t } = useLocale();
  return <section><h3>{t('daily.revisionHistory')}</h3><ol aria-label={t('daily.revisionHistory')}>{revisions.map((item) => <li key={item.revision}><strong>{t('daily.version', { number: item.revision })}</strong> · {item.editorName} · <time dateTime={item.createdAt}>{item.createdAt}</time></li>)}</ol></section>;
}
