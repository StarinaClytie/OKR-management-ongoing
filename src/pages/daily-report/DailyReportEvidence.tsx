import type { DailyEvidenceDraft } from '../../domain/dailyEntry';
import type { Classification, Objective } from '../../domain/types';
import { validateAttachment } from '../../services/attachmentService';
import { AttachmentList } from './AttachmentList';
import { useLocale } from '../../i18n/LocaleProvider';
import type { MessageKey } from '../../i18n/messages';

interface DailyReportEvidenceProps {
  objectives: readonly Objective[];
  linkedObjectiveId?: string;
  evidence: DailyEvidenceDraft[];
  onLinkedObjectiveChange: (objectiveId: string | undefined) => void;
  onEvidenceChange: (items: DailyEvidenceDraft[]) => void;
  errors?: Record<string, string>;
}

const classifications: Array<{ value: Classification; label: MessageKey }> = [
  { value: 'public', label: 'classification.public' },
  { value: 'internal', label: 'classification.internal' },
  { value: 'confidential', label: 'classification.confidential' },
  { value: 'restricted', label: 'classification.restricted' },
];

export function DailyReportEvidence({ objectives, linkedObjectiveId, evidence, onLinkedObjectiveChange, onEvidenceChange, errors = {} }: DailyReportEvidenceProps) {
  const { t } = useLocale();
  const addEvidence = () => {
    const nextNumber = evidence.length + 1;
    onEvidenceChange([...evidence, { id: `evidence-${nextNumber}`, label: '', kind: 'link', classification: 'internal' }]);
  };

  return (
    <section className="daily-evidence form-card form-section" aria-labelledby="daily-evidence-heading">
      <h2 id="daily-evidence-heading">{t('daily.evidenceTitle')}</h2>
      <div className="daily-form-grid daily-form-grid--single">
        <label htmlFor="linked-objective">
          {t('daily.linkObjective')}
          <select id="linked-objective" value={linkedObjectiveId ?? ''} onChange={(event) => onLinkedObjectiveChange(event.target.value || undefined)}>
            <option value="">{t('daily.notLinked')}</option>
            {objectives.map((objective) => <option key={objective.id} value={objective.id}>{objective.title}</option>)}
          </select>
        </label>
      </div>
      <div className="daily-evidence__header">
        <h3>{t('daily.evidenceAttachmentLink')}</h3>
        <button type="button" className="button button--secondary" onClick={addEvidence}>{t('daily.addEvidence')}</button>
      </div>
      <label className="button button--secondary">{t('daily.chooseAttachment')}
        <input className="sr-only" aria-label={t('daily.chooseEvidenceAttachment')} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.txt" onChange={(event) => {
          const selected = Array.from(event.target.files ?? []).map((file, index): DailyEvidenceDraft => {
            const error = validateAttachment(file);
            return { id: `file-${Date.now()}-${index}`, label: file.name, kind: 'file', classification: 'internal', file, uploadState: error ? 'failed' : 'selected', uploadProgress: 0, error: error?.message };
          });
          onEvidenceChange([...evidence, ...selected]);
        }} />
      </label>
      <AttachmentList items={evidence.filter((item) => item.kind === 'file')} onRemove={(id) => onEvidenceChange(evidence.filter((item) => item.id !== id))} />
      {evidence.map((item, index) => {
        const number = index + 1;
        const errorFor = (field: 'label' | 'kind' | 'classification') => errors[`evidence.${index}.${field}`];
        const errorId = (field: 'label' | 'kind' | 'classification') => `evidence-${item.id}-${field}-error`;
        return (
          <div className="daily-evidence__row" key={item.id}>
            <label htmlFor={`evidence-${item.id}-label`}>
              {t('daily.evidenceNumber', { number })}
              <input id={`evidence-${item.id}-label`} value={item.label} aria-invalid={Boolean(errorFor('label'))} aria-describedby={errorFor('label') ? errorId('label') : undefined} onChange={(event) => onEvidenceChange(evidence.map((candidate) => candidate.id === item.id ? { ...candidate, label: event.target.value } : candidate))} placeholder={t('daily.evidencePlaceholder')} />
              {errorFor('label') && <span id={errorId('label')} role="alert" className="field-error">{errorFor('label')}</span>}
            </label>
            <label htmlFor={`evidence-${item.id}-kind`}>
              {t('daily.evidenceType', { number })}
              <select id={`evidence-${item.id}-kind`} value={item.kind} aria-invalid={Boolean(errorFor('kind'))} aria-describedby={errorFor('kind') ? errorId('kind') : undefined} onChange={(event) => onEvidenceChange(evidence.map((candidate) => candidate.id === item.id ? { ...candidate, kind: event.target.value as DailyEvidenceDraft['kind'] } : candidate))}>
                <option value="file">{t('daily.attachment')}</option>
                <option value="link">{t('daily.link')}</option>
              </select>
              {errorFor('kind') && <span id={errorId('kind')} role="alert" className="field-error">{errorFor('kind')}</span>}
            </label>
            <label htmlFor={`evidence-${item.id}-classification`}>
              {t('daily.evidenceLevel', { number })}
              <select id={`evidence-${item.id}-classification`} value={item.classification} aria-invalid={Boolean(errorFor('classification'))} aria-describedby={errorFor('classification') ? errorId('classification') : undefined} onChange={(event) => onEvidenceChange(evidence.map((candidate) => candidate.id === item.id ? { ...candidate, classification: event.target.value as Classification } : candidate))}>
                {classifications.map((classification) => <option key={classification.value} value={classification.value}>{t(classification.label)}</option>)}
              </select>
              {errorFor('classification') && <span id={errorId('classification')} role="alert" className="field-error">{errorFor('classification')}</span>}
            </label>
          </div>
        );
      })}
    </section>
  );
}
