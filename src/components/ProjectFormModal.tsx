import { useEffect, useRef, useState, type FormEvent } from 'react';
import { roleLabels } from '../auth/roleLabels';
import type { OrganizationUser } from '../data/types';
import type { Classification, ProjectStatus } from '../domain/types';
import { useLocale } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';

const classifications: readonly Classification[] = ['public', 'internal', 'confidential', 'restricted'];
const statuses: readonly ProjectStatus[] = ['planned', 'active', 'on_hold', 'completed'];

const classificationKeys: Record<Classification, MessageKey> = {
  public: 'classification.public',
  internal: 'classification.internal',
  confidential: 'classification.confidential',
  restricted: 'classification.restricted',
};

const statusKeys: Record<ProjectStatus, MessageKey> = {
  planned: 'status.planned',
  active: 'status.active',
  on_hold: 'status.onHold',
  completed: 'status.completed',
  archived: 'status.archived',
};

export interface ProjectFormValues {
  name: string;
  description: string;
  leaderId: string;
  startDate: string;
  dueDate: string;
  classification: Classification;
  status: ProjectStatus;
  memberIds: string[];
}

export interface ProjectFormModalProps {
  title: string;
  mode: 'create' | 'edit';
  initial: ProjectFormValues;
  eligibleUsers: OrganizationUser[];
  canEditClassification: boolean;
  canEditStatus: boolean;
  submitting?: boolean;
  error?: string;
  onSubmit: (values: ProjectFormValues) => void;
  onClose: () => void;
}

export function ProjectFormModal({
  title,
  mode,
  initial,
  eligibleUsers,
  canEditClassification,
  canEditStatus,
  submitting = false,
  error,
  onSubmit,
  onClose,
}: ProjectFormModalProps) {
  const { t } = useLocale();
  const [values, setValues] = useState<ProjectFormValues>(initial);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const isCreate = mode === 'create';

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

  function set<K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldError(undefined);
  }

  function toggleMember(memberId: string) {
    setValues((current) => ({
      ...current,
      memberIds: current.memberIds.includes(memberId)
        ? current.memberIds.filter((id) => id !== memberId)
        : [...current.memberIds, memberId],
    }));
    setFieldError(undefined);
  }

  const nameValid = values.name.trim() !== '';
  const leaderValid = !isCreate || values.leaderId !== '';
  const dateValid = values.startDate === '' || values.dueDate === '' || values.dueDate >= values.startDate;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!nameValid) {
      setFieldError(t('projects.validation.nameRequired'));
      return;
    }
    if (!leaderValid) {
      setFieldError(t('projects.validation.leaderRequired'));
      return;
    }
    if (!dateValid) {
      setFieldError(t('projects.validation.dateRange'));
      return;
    }
    setFieldError(undefined);
    onSubmit({ ...values, name: values.name.trim(), description: values.description.trim() });
  }

  return (
    <div className="modal-scrim" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="modal-panel" role="dialog" aria-modal="true" aria-label={title} onSubmit={handleSubmit} noValidate>
        <h2>{title}</h2>

        <label className="modal-field">
          <span>{t('projects.field.name')} *</span>
          <input ref={firstFieldRef} value={values.name} onChange={(event) => set('name', event.target.value)} required />
        </label>

        <label className="modal-field">
          <span>{t('projects.field.description')}</span>
          <textarea value={values.description} onChange={(event) => set('description', event.target.value)} rows={3} />
        </label>

        {isCreate ? (
          <label className="modal-field">
            <span>{t('projects.field.leader')} *</span>
            <select value={values.leaderId} onChange={(event) => set('leaderId', event.target.value)} required>
              <option value="">{t('daily.select')}</option>
              {eligibleUsers.map((user) => (
                <option key={user.id} value={user.id}>{user.displayName} · {user.role ? t(roleLabels[user.role]) : '—'}</option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="modal-field">
          <span>{t('projects.field.startDate')} *</span>
          <input type="date" value={values.startDate} onChange={(event) => set('startDate', event.target.value)} required />
        </label>

        <label className="modal-field">
          <span>{t('projects.field.dueDate')} *</span>
          <input type="date" value={values.dueDate} onChange={(event) => set('dueDate', event.target.value)} required />
        </label>

        <label className="modal-field">
          <span>{t('projects.field.classification')} *</span>
          <select value={values.classification} onChange={(event) => set('classification', event.target.value as Classification)} disabled={!canEditClassification}>
            {classifications.map((classification) => <option key={classification} value={classification}>{t(classificationKeys[classification])}</option>)}
          </select>
        </label>

        <label className="modal-field">
          <span>{t('projects.field.status')} *</span>
          <select value={values.status} onChange={(event) => set('status', event.target.value as ProjectStatus)} disabled={!canEditStatus}>
            {statuses.map((status) => <option key={status} value={status}>{t(statusKeys[status])}</option>)}
          </select>
        </label>

        {isCreate ? (
          <div className="modal-field">
            <span>{t('projects.field.members')}</span>
            {eligibleUsers.length === 0 ? (
              <p className="form-error">{t('projects.noEligibleMembers')}</p>
            ) : (
              <div className="member-picker">
                {eligibleUsers.map((user) => (
                  <label key={user.id} className="member-picker__option">
                    <input
                      type="checkbox"
                      checked={values.memberIds.includes(user.id)}
                      onChange={() => toggleMember(user.id)}
                    />
                    <span>{user.displayName} · {user.role ? t(roleLabels[user.role]) : '—'}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {error || fieldError ? <p className="form-error" role="alert">{error ?? fieldError}</p> : null}

        <div className="modal-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="button button--primary" disabled={submitting || !nameValid || !leaderValid || !dateValid}>
            {submitting ? t('common.saving') : t('projects.save')}
          </button>
        </div>
      </form>
    </div>
  );
}
