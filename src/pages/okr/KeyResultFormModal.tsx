import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { KrMetricType, OkrPriority, User } from '../../domain/types';
import { useLocale } from '../../i18n/LocaleProvider';
import type { MessageKey } from '../../i18n/messages';

const metricTypes: readonly KrMetricType[] = ['numeric', 'percentage', 'milestone'];
const metricTypeKeys: Record<KrMetricType, MessageKey> = {
  numeric: 'kr.metricType.numeric',
  percentage: 'kr.metricType.percentage',
  milestone: 'kr.metricType.milestone',
};
const priorities: readonly OkrPriority[] = ['high', 'medium', 'low'];
const priorityKeys: Record<OkrPriority, MessageKey> = { high: 'priority.high', medium: 'priority.medium', low: 'priority.low' };

export interface KeyResultFormValues {
  title: string;
  ownerId: string;
  deadline: string;
  metricType: KrMetricType;
  currentValue?: number;
  targetValue?: number;
  unit: string;
  percentageCurrent?: number;
  percentageTarget?: number;
  milestoneDefinition: string;
  collaboratorIds: string[];
  priority: OkrPriority;
  confidenceIndex?: number;
  notes: string;
}

export interface KeyResultFormModalProps {
  title: string;
  initial: KeyResultFormValues;
  members: readonly User[];
  submitting?: boolean;
  error?: string;
  onSubmit: (values: KeyResultFormValues) => void;
  onClose: () => void;
}

const numberValue = (value: string): number | undefined => (value === '' ? undefined : Number(value));

export function KeyResultFormModal({ title, initial, members, submitting = false, error, onSubmit, onClose }: KeyResultFormModalProps) {
  const { t } = useLocale();
  const [values, setValues] = useState<KeyResultFormValues>(initial);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function set<K extends keyof KeyResultFormValues>(key: K, value: KeyResultFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldError(undefined);
  }

  function toggleCollaborator(userId: string) {
    setValues((current) => ({
      ...current,
      collaboratorIds: current.collaboratorIds.includes(userId)
        ? current.collaboratorIds.filter((id) => id !== userId)
        : [...current.collaboratorIds, userId],
    }));
    setFieldError(undefined);
  }

  const titleValid = values.title.trim() !== '';
  const ownerValid = values.ownerId !== '';
  const deadlineValid = values.deadline !== '';
  const metricValid = values.metricType === 'milestone'
    ? values.milestoneDefinition.trim() !== ''
    : values.metricType === 'numeric'
      ? values.targetValue !== undefined && Number.isFinite(values.targetValue)
      : values.percentageTarget !== undefined && Number.isFinite(values.percentageTarget);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!titleValid) return setFieldError(t('kr.validation.titleRequired'));
    if (!ownerValid) return setFieldError(t('kr.validation.ownerRequired'));
    if (!deadlineValid) return setFieldError(t('kr.validation.deadlineRequired'));
    if (!metricValid) return setFieldError(t('kr.validation.metricRequired'));
    setFieldError(undefined);
    onSubmit({ ...values, title: values.title.trim(), notes: values.notes.trim(), milestoneDefinition: values.milestoneDefinition.trim() });
  }

  return (
    <div className="modal-scrim" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="modal-panel" role="dialog" aria-modal="true" aria-label={title} onSubmit={handleSubmit} noValidate>
        <h2>{title}</h2>

        <label className="modal-field">
          <span>{t('kr.field.title')} *</span>
          <input ref={firstFieldRef} value={values.title} onChange={(event) => set('title', event.target.value)} required />
        </label>

        <label className="modal-field">
          <span>{t('kr.field.owner')} *</span>
          <select value={values.ownerId} onChange={(event) => set('ownerId', event.target.value)} required>
            <option value="">{t('daily.select')}</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        </label>

        <label className="modal-field">
          <span>{t('kr.field.deadline')} *</span>
          <input type="date" value={values.deadline} onChange={(event) => set('deadline', event.target.value)} required />
        </label>

        <label className="modal-field">
          <span>{t('kr.field.metricType')}</span>
          <select value={values.metricType} onChange={(event) => set('metricType', event.target.value as KrMetricType)}>
            {metricTypes.map((metricType) => <option key={metricType} value={metricType}>{t(metricTypeKeys[metricType])}</option>)}
          </select>
        </label>

        {values.metricType === 'numeric' ? (
          <>
            <label className="modal-field">
              <span>{t('kr.field.currentValue')}</span>
              <input type="number" inputMode="decimal" value={values.currentValue ?? ''} onChange={(event) => set('currentValue', numberValue(event.target.value))} />
            </label>
            <label className="modal-field">
              <span>{t('kr.field.targetValue')} *</span>
              <input type="number" inputMode="decimal" value={values.targetValue ?? ''} onChange={(event) => set('targetValue', numberValue(event.target.value))} />
            </label>
            <label className="modal-field">
              <span>{t('kr.field.unit')}</span>
              <input value={values.unit} onChange={(event) => set('unit', event.target.value)} />
            </label>
          </>
        ) : null}

        {values.metricType === 'percentage' ? (
          <>
            <label className="modal-field">
              <span>{t('kr.field.percentageCurrent')}</span>
              <input type="number" min="0" max="100" inputMode="decimal" value={values.percentageCurrent ?? ''} onChange={(event) => set('percentageCurrent', numberValue(event.target.value))} />
            </label>
            <label className="modal-field">
              <span>{t('kr.field.percentageTarget')} *</span>
              <input type="number" min="0" max="100" inputMode="decimal" value={values.percentageTarget ?? ''} onChange={(event) => set('percentageTarget', numberValue(event.target.value))} />
            </label>
          </>
        ) : null}

        {values.metricType === 'milestone' ? (
          <label className="modal-field">
            <span>{t('kr.field.milestoneDefinition')} *</span>
            <textarea value={values.milestoneDefinition} onChange={(event) => set('milestoneDefinition', event.target.value)} rows={2} />
          </label>
        ) : null}

        <button type="button" className="text-button" aria-expanded={showAdvanced} onClick={() => setShowAdvanced((value) => !value)}>
          {t('kr.advancedSettings')}
        </button>

        {showAdvanced ? (
          <>
            <div className="modal-field">
              <span>{t('kr.field.collaborators')}</span>
              <div className="member-picker">
                {members.filter((member) => member.id !== values.ownerId).map((member) => (
                  <label key={member.id} className="member-picker__option">
                    <input type="checkbox" checked={values.collaboratorIds.includes(member.id)} onChange={() => toggleCollaborator(member.id)} />
                    <span>{member.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <label className="modal-field">
              <span>{t('kr.field.priority')}</span>
              <select value={values.priority} onChange={(event) => set('priority', event.target.value as OkrPriority)}>
                {priorities.map((priority) => <option key={priority} value={priority}>{t(priorityKeys[priority])}</option>)}
              </select>
            </label>
            <label className="modal-field">
              <span>{t('kr.field.confidence')}</span>
              <input type="number" min="0" max="100" inputMode="decimal" value={values.confidenceIndex ?? ''} onChange={(event) => set('confidenceIndex', numberValue(event.target.value))} />
            </label>
            <label className="modal-field">
              <span>{t('kr.field.notes')}</span>
              <textarea value={values.notes} onChange={(event) => set('notes', event.target.value)} rows={2} />
            </label>
          </>
        ) : null}

        {error || fieldError ? <p className="form-error" role="alert">{error ?? fieldError}</p> : null}

        <div className="modal-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="button button--primary" disabled={submitting || !titleValid || !ownerValid || !deadlineValid || !metricValid}>
            {submitting ? t('common.saving') : t('kr.save')}
          </button>
        </div>
      </form>
    </div>
  );
}
