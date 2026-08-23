import type { DailyEvidenceDraft } from '../../domain/dailyEntry';
import type { Classification } from '../../domain/types';
import { validateAttachment } from '../../services/attachmentService';
import { useLocale } from '../../i18n/LocaleProvider';
import type { MessageKey } from '../../i18n/messages';
import { allowedClassifications } from '../../domain/dailyReportPolicy';
import { AttachmentList } from './AttachmentList';

interface DailyReportEvidenceProps {
  evidence: DailyEvidenceDraft[];
  onEvidenceChange: (update: DailyEvidenceDraft[] | ((current: DailyEvidenceDraft[]) => DailyEvidenceDraft[])) => void;
  errors?: Record<string, string>;
  idPrefix?: string;
  errorPrefix?: string;
  onFieldRef?: (field: string, element: HTMLElement | null) => void;
  onDownloadAttachment?: (attachmentId: string) => void | Promise<void>;
  onRemoveAttachment?: (attachmentId: string) => boolean | Promise<boolean>;
  onRemoveEvidence?: (item: DailyEvidenceDraft) => boolean | Promise<boolean>;
  onUploadRequested?: (item: DailyEvidenceDraft) => void | Promise<void>;
  onRetryRequested?: (itemId: string) => void | Promise<void>;
  clearance?: Classification;
}

const classifications: Array<{ value: Classification; label: MessageKey }> = [
  { value: 'public', label: 'classification.public' },
  { value: 'internal', label: 'classification.internal' },
  { value: 'confidential', label: 'classification.confidential' },
  { value: 'restricted', label: 'classification.restricted' },
];

export function DailyReportEvidence({ evidence, onEvidenceChange, errors = {}, idPrefix = 'daily', errorPrefix = '', onFieldRef, onDownloadAttachment, onRemoveAttachment, onRemoveEvidence, onUploadRequested, onRetryRequested, clearance = 'restricted' }: DailyReportEvidenceProps) {
  const { t } = useLocale();
  const allowed = allowedClassifications(clearance);
  const defaultClassification: Classification = allowed.includes('internal') ? 'internal' : 'public';

  return (
    <section className="daily-evidence">
      <label className="button button--secondary">{t('daily.chooseAttachment')}
        <input className="sr-only" aria-label={t('daily.chooseEvidenceAttachment')} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.txt" onChange={(event) => {
          const selected = Array.from(event.target.files ?? []).map((file, index): DailyEvidenceDraft => {
            const error = validateAttachment(file);
            return { id: `file-${Date.now()}-${index}`, label: file.name, kind: 'file', classification: defaultClassification, file, uploadState: error ? 'failed' : 'selected', uploadProgress: 0, error: error?.message };
          });
          onEvidenceChange((current) => [...current, ...selected]);
          selected.filter((item) => item.uploadState === 'selected').forEach((item) => void onUploadRequested?.(item));
          event.target.value = '';
        }} />
      </label>
      {evidence.map((item, index) => {
        const number = index + 1;
        const errorFor = (field: 'label' | 'kind' | 'classification' | 'file') => errors[`${errorPrefix}evidence.${index}.${field}`];
        const labelError = errorFor('label') ?? errorFor('kind') ?? errorFor('file');
        const errorId = (field: 'label' | 'kind' | 'classification' | 'file') => `${idPrefix}-evidence-${item.id}-${field}-error`;
        const labelField = `${errorPrefix}evidence.${index}.label`;
        const labelErrorField = errorFor('label') ? 'label' : errorFor('kind') ? 'kind' : 'file';
        return (
          <div className="daily-evidence__row" key={item.id}>
            <label htmlFor={`evidence-${item.id}-label`}>
              {t('daily.evidenceNumber', { number })}
              <input ref={(element) => { onFieldRef?.(labelField, element); onFieldRef?.(`${errorPrefix}evidence.${index}.kind`, element); onFieldRef?.(`${errorPrefix}evidence.${index}.file`, element); }} id={`evidence-${item.id}-label`} value={item.label} aria-invalid={Boolean(labelError)} aria-describedby={labelError ? errorId(labelErrorField) : undefined} onChange={(event) => { const label = event.target.value; onEvidenceChange((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, label } : candidate)); }} placeholder={t('daily.evidencePlaceholder')} />
              {labelError && <span id={errorId(labelErrorField)} role="alert" className="field-error">{labelError}</span>}
            </label>
            {!allowed.includes(item.classification) && item.attachmentId ? (
              <p><span>{t('daily.evidenceLevel', { number })}</span><strong>{t(classifications.find((candidate) => candidate.value === item.classification)!.label)}</strong></p>
            ) : (
              <label htmlFor={`evidence-${item.id}-classification`}>
                {t('daily.evidenceLevel', { number })}
                <select ref={(element) => onFieldRef?.(`${errorPrefix}evidence.${index}.classification`, element)} id={`evidence-${item.id}-classification`} value={item.classification} aria-invalid={Boolean(errorFor('classification'))} aria-describedby={errorFor('classification') ? errorId('classification') : undefined} onChange={(event) => { const classification = event.target.value as Classification; onEvidenceChange((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, classification } : candidate)); }}>
                  {classifications.filter((classification) => allowed.includes(classification.value)).map((classification) => <option key={classification.value} value={classification.value}>{t(classification.label)}</option>)}
                </select>
                {errorFor('classification') && <span id={errorId('classification')} role="alert" className="field-error">{errorFor('classification')}</span>}
              </label>
            )}
            {item.attachmentId && onDownloadAttachment ? <button type="button" className="button button--secondary" aria-label={`${t('daily.download')} ${item.label}`} onClick={() => void onDownloadAttachment(item.attachmentId!)}>{t('daily.download')}</button> : null}
            <button type="button" className="button button--secondary" aria-label={`${t('daily.remove')} ${item.label}`} onClick={async () => {
              if (onRemoveEvidence) {
                const removed = await onRemoveEvidence(item);
                if (!removed) return;
              } else if (item.attachmentId && onRemoveAttachment) {
                const removed = await onRemoveAttachment(item.attachmentId);
                if (!removed) return;
              }
              onEvidenceChange((current) => current.filter((candidate) => candidate.id !== item.id));
            }}>{t('daily.remove')}</button>
          </div>
        );
      })}
      <AttachmentList items={evidence.filter((item) => item.kind === 'file' && Boolean(item.uploadState))} onRetry={onRetryRequested ? (id) => void onRetryRequested(id) : undefined} />
    </section>
  );
}
