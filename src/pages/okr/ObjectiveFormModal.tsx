import { useEffect, useRef, useState, type FormEvent } from 'react';
import { roleLabels } from '../../auth/roleLabels';
import type { OrganizationUser } from '../../data/types';
import type { OkrPriority } from '../../domain/types';
import { useLocale } from '../../i18n/LocaleProvider';
import type { MessageKey } from '../../i18n/messages';

const priorities: readonly OkrPriority[] = ['high', 'medium', 'low'];
const priorityKeys: Record<OkrPriority, MessageKey> = { high: 'priority.high', medium: 'priority.medium', low: 'priority.low' };

export interface ObjectiveFormValues {
  name: string;
  number: string;
  leaderId: string;
  quarter: string;
  startDate: string;
  dueDate: string;
  priority: OkrPriority;
  description: string;
}

export interface ObjectiveFormModalProps {
  title: string;
  mode: 'create' | 'edit';
  initial: ObjectiveFormValues;
  eligibleUsers: OrganizationUser[];
  submitting?: boolean;
  error?: string;
  onSubmit: (values: ObjectiveFormValues) => void;
  onClose: () => void;
}

export function ObjectiveFormModal({
  title,
  mode,
  initial,
  eligibleUsers,
  submitting = false,
  error,
  onSubmit,
  onClose,
}: ObjectiveFormModalProps) {
  const { t } = useLocale();
  const [values, setValues] = useState<ObjectiveFormValues>(initial);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [showAdvanced, setShowAdvanced] = useState(mode === 'edit');
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const isCreate = mode === 'create';
  // Only project leaders are eligible to lead an Objective (business role).
  const leaderCandidates = eligibleUsers.filter((user) => user.role === 'project_leader');

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

  function set<K extends keyof ObjectiveFormValues>(key: K, value: ObjectiveFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldError(undefined);
  }

  const nameValid = values.name.trim() !== '';
  const leaderValid = values.leaderId !== '';
  const dateValid = values.startDate === '' || values.dueDate === '' || values.dueDate >= values.startDate;
  const quarterValid = values.quarter.trim() !== '';

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!nameValid) return setFieldError(t('objective.validation.nameRequired'));
    if (!leaderValid) return setFieldError(t('objective.validation.leaderRequired'));
    if (!quarterValid) return setFieldError(t('objective.validation.nameRequired'));
    if (!dateValid) return setFieldError(t('objective.validation.dateRange'));
    setFieldError(undefined);
    onSubmit({ ...values, name: values.name.trim(), quarter: values.quarter.trim(), description: values.description.trim() });
  }

  return (
    <div className="modal-scrim" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="modal-panel" role="dialog" aria-modal="true" aria-label={title} onSubmit={handleSubmit} noValidate>
        <h2>{title}</h2>

        <label className="modal-field">
          <span>{t('objective.field.name')} *</span>
          <input ref={firstFieldRef} value={values.name} onChange={(event) => set('name', event.target.value)} required />
        </label>

        <label className="modal-field">
          <span>{t('objective.field.leader')} *</span>
          {leaderCandidates.length === 0 ? (
            <p role="status">{t('objective.noEligibleLeaders')}</p>
          ) : (
            <select value={values.leaderId} onChange={(event) => set('leaderId', event.target.value)} required>
              <option value="">{t('daily.select')}</option>
              {leaderCandidates.map((user) => (
                <option key={user.id} value={user.id}>{user.displayName} · {user.role ? t(roleLabels[user.role]) : '—'}</option>
              ))}
            </select>
          )}
        </label>

        <label className="modal-field">
          <span>{t('objective.field.quarter')} *</span>
          <input value={values.quarter} onChange={(event) => set('quarter', event.target.value)} placeholder={t('objective.quarterPlaceholder')} required />
        </label>

        <label className="modal-field">
          <span>{t('objective.field.startDate')} *</span>
          <input type="date" value={values.startDate} onChange={(event) => set('startDate', event.target.value)} required />
        </label>

        <label className="modal-field">
          <span>{t('objective.field.dueDate')} *</span>
          <input type="date" value={values.dueDate} onChange={(event) => set('dueDate', event.target.value)} required />
        </label>

        <button type="button" className="text-button" aria-expanded={showAdvanced} onClick={() => setShowAdvanced((value) => !value)}>
          {t('objective.advancedSettings')}
        </button>

        {showAdvanced ? (
          <>
            <label className="modal-field">
              <span>{t('objective.field.number')}</span>
              <input value={values.number} onChange={(event) => set('number', event.target.value)} placeholder={isCreate ? t('objective.autoNumberHint') : ''} />
            </label>
            <label className="modal-field">
              <span>{t('objective.field.priority')}</span>
              <select value={values.priority} onChange={(event) => set('priority', event.target.value as OkrPriority)}>
                {priorities.map((priority) => <option key={priority} value={priority}>{t(priorityKeys[priority])}</option>)}
              </select>
            </label>
            <label className="modal-field">
              <span>{t('objective.field.description')}</span>
              <textarea value={values.description} onChange={(event) => set('description', event.target.value)} rows={3} />
            </label>
          </>
        ) : null}

        {error || fieldError ? <p className="form-error" role="alert">{error ?? fieldError}</p> : null}

        <div className="modal-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="button button--primary" disabled={submitting || !nameValid || !leaderValid || !dateValid || !quarterValid}>
            {submitting ? t('common.saving') : t('objective.save')}
          </button>
        </div>
      </form>
    </div>
  );
}
