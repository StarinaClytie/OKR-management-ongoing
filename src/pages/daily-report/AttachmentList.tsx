import type { DailyEvidenceDraft } from '../../domain/dailyEntry';
import { useLocale } from '../../i18n/LocaleProvider';
import type { MessageKey } from '../../i18n/messages';

const uploadStateKeys: Record<NonNullable<DailyEvidenceDraft['uploadState']>, MessageKey> = {
  selected: 'daily.uploadSelected', pending: 'daily.uploadPending', uploading: 'daily.uploading', verifying: 'daily.uploadPending', uploaded: 'daily.uploaded', failed: 'daily.uploadFailed', deleting: 'daily.deleting',
};
const classificationKeys: Record<DailyEvidenceDraft['classification'], MessageKey> = {
  public: 'classification.public', internal: 'classification.internal', confidential: 'classification.confidential', restricted: 'classification.restricted',
};

export function AttachmentList({ items, onRetry, onReplace, onRemove, onDownload }: {
  items: DailyEvidenceDraft[];
  onRetry?: (id: string) => void;
  onReplace?: (id: string, file: File) => void;
  onRemove?: (id: string) => void;
  onDownload?: (id: string) => void;
}) {
  const { t } = useLocale();
  if (!items.length) return null;
  return <ul aria-label={t('daily.selectedAttachments')} className="attachment-list">{items.map((item) => <li key={item.id}>
    <span>{item.label}</span><span>{t(classificationKeys[item.classification])}</span>
    <progress aria-label={t('daily.uploadProgress', { name: item.label })} max={100} value={item.uploadProgress ?? (item.uploadState === 'uploaded' ? 100 : 0)} />
    <span role={item.error ? 'alert' : undefined}>{item.error ? t('daily.attachmentInvalid') : item.uploadState ? t(uploadStateKeys[item.uploadState]) : ''}</span>
    {item.uploadState === 'failed' && <button type="button" onClick={() => onRetry?.(item.id)}>{t('daily.retry')}</button>}
    {item.uploadState === 'uploaded' && onDownload ? <button type="button" onClick={() => onDownload(item.id)}>{t('daily.download')}</button> : null}
    {onReplace ? <label className="text-button">{t('daily.replace')}<input className="sr-only" aria-label={t('daily.replaceLabel', { name: item.label })} type="file" onChange={(event) => event.target.files?.[0] && onReplace(item.id, event.target.files[0])} /></label> : null}
    {onRemove ? <button type="button" onClick={() => onRemove(item.id)}>{t('daily.remove')}</button> : null}
  </li>)}</ul>;
}
