import { dailyEvidenceIsUploaded, type DailyEvidenceDraft } from '../../domain/dailyEntry';
import { useLocale } from '../../i18n/LocaleProvider';
import type { MessageKey } from '../../i18n/messages';
import type { RepositoryErrorCode } from '../../data/types';
import { repositoryErrorKey } from '../../i18n/repositoryErrors';

const uploadStateKeys: Record<NonNullable<DailyEvidenceDraft['uploadState']>, MessageKey> = {
  selected: 'daily.uploadPending', pending: 'daily.uploadPending', uploading: 'daily.uploading', verifying: 'daily.uploadVerifying', uploaded: 'daily.uploaded', failed: 'daily.uploadFailed', deleting: 'daily.deleting',
};
const classificationKeys: Record<DailyEvidenceDraft['classification'], MessageKey> = {
  public: 'classification.public', internal: 'classification.internal', confidential: 'classification.confidential', restricted: 'classification.restricted',
};

function uploadFailureKey(errorCode: RepositoryErrorCode | undefined, error: string | undefined): MessageKey {
  if (errorCode) return repositoryErrorKey(errorCode);
  const text = error?.toLowerCase() ?? '';
  if (text === 'locked') return 'daily.reportLocked';
  if (text === 'clearance') return 'daily.attachmentClearance';
  if (text === 'storage') return 'daily.uploadStorageFailed';
  if (text === 'network') return 'daily.uploadNetworkFailed';
  if (text.includes('locked') || text.includes('锁定') || text.includes('confirmed')) return 'daily.reportLocked';
  if (text.includes('密级') || text.includes('clearance') || text.includes('classification')) return 'daily.attachmentClearance';
  if (text.includes('network') || text.includes('网络') || text.includes('fetch') || text.includes('offline') || text.includes('connection')) return 'daily.uploadNetworkFailed';
  if (text.includes('storage') || text.includes('存储')) return 'daily.uploadStorageFailed';
  if (text.includes('文件') || text.includes('file') || text.includes('unsupported')) return 'daily.attachmentInvalid';
  return 'daily.uploadFailed';
}

export function AttachmentList({ items, onRetry, onReplace, onRemove, onDownload }: {
  items: DailyEvidenceDraft[];
  onRetry?: (id: string) => void;
  onReplace?: (id: string, file: File) => void;
  onRemove?: (id: string) => void;
  onDownload?: (id: string) => void;
}) {
  const { t } = useLocale();
  if (!items.length) return null;
  return <ul aria-label={t('daily.selectedAttachments')} className="attachment-list">{items.map((item) => {
    const isUploaded = dailyEvidenceIsUploaded(item);
    const missingAttachmentId = item.uploadState === 'uploaded' && !isUploaded;
    const state = missingAttachmentId ? 'verifying' : item.uploadState;
    const progress = missingAttachmentId ? 0 : item.uploadProgress ?? (isUploaded ? 100 : 0);
    const status = item.errorCode || item.error
      ? t(uploadFailureKey(item.errorCode, item.error))
      : state === 'uploading'
        ? t('daily.uploadingPercent', { percent: progress })
        : state
          ? t(uploadStateKeys[state])
          : '';
    return <li key={item.id}>
    <span>{item.label}</span><span>{t(classificationKeys[item.classification])}</span>
    <span className="attachment-list__progress"><progress aria-label={t('daily.uploadProgress', { name: item.label })} max={100} value={progress} /><span aria-hidden="true">{progress}%</span></span>
    <span className="attachment-list__status" role={item.errorCode || item.error ? 'alert' : undefined}>{status}</span>
    {item.uploadState === 'failed' && <button type="button" onClick={() => onRetry?.(item.id)}>{t('daily.retry')}</button>}
    {isUploaded && onDownload ? <button type="button" onClick={() => onDownload(item.id)}>{t('daily.download')}</button> : null}
    {onReplace ? <label className="text-button">{t('daily.replace')}<input className="sr-only" aria-label={t('daily.replaceLabel', { name: item.label })} type="file" onChange={(event) => event.target.files?.[0] && onReplace(item.id, event.target.files[0])} /></label> : null}
    {onRemove ? <button type="button" onClick={() => onRemove(item.id)}>{t('daily.remove')}</button> : null}
  </li>;
  })}</ul>;
}
