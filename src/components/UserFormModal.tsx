import { useEffect, useRef, useState, type FormEvent } from 'react';
import { roleLabels } from '../auth/roleLabels';
import type { ProjectSummary } from '../data/types';
import type { Role } from '../domain/types';
import { useLocale } from '../i18n/LocaleProvider';

export interface UserFormValues {
  displayName: string;
  email: string;
  department: string;
  jobTitle: string;
  role: Role;
  projectIds: string[];
}

export interface UserFormModalProps {
  title: string;
  initial: UserFormValues;
  nameReadOnly?: boolean;
  emailReadOnly?: boolean;
  emailRequired?: boolean;
  submitLabel: string;
  submitting?: boolean;
  error?: string;
  /** When present, renders the project-membership multi-select (edit mode). */
  projects?: ProjectSummary[];
  /** Projects the target leads; shown auto-checked and read-only. */
  readOnlyProjectIds?: readonly string[];
  onSubmit: (values: UserFormValues) => void;
  onClose: () => void;
}

const roles: readonly Role[] = ['administrator', 'management', 'project_leader', 'employee', 'hr'];

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function UserFormModal({
  title,
  initial,
  nameReadOnly = false,
  emailReadOnly = false,
  emailRequired = false,
  submitLabel,
  submitting = false,
  error,
  projects,
  readOnlyProjectIds = [],
  onSubmit,
  onClose,
}: UserFormModalProps) {
  const { t } = useLocale();
  const [values, setValues] = useState<UserFormValues>(initial);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
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

  function set<K extends keyof UserFormValues>(key: K, value: UserFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldError(undefined);
  }

  function toggleProject(projectId: string) {
    setValues((current) => ({
      ...current,
      projectIds: current.projectIds.includes(projectId)
        ? current.projectIds.filter((id) => id !== projectId)
        : [...current.projectIds, projectId],
    }));
    setFieldError(undefined);
  }

  const displayNameValid = values.displayName.trim() !== '';
  const emailPresent = values.email.trim() !== '';
  const emailValid = !emailRequired || isValidEmail(values.email);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!displayNameValid) return;
    if (!emailValid) {
      setFieldError(t('users.inviteInvalidEmail'));
      return;
    }
    setFieldError(undefined);
    onSubmit({ ...values, displayName: values.displayName.trim(), email: values.email.trim() });
  }

  return (
    <div className="modal-scrim" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="modal-panel" role="dialog" aria-modal="true" aria-label={title} onSubmit={handleSubmit} noValidate>
        <h2>{title}</h2>
        <label className="modal-field">
          <span>{t('users.field.displayName')} *</span>
          <input ref={firstFieldRef} value={values.displayName} onChange={(event) => set('displayName', event.target.value)} disabled={nameReadOnly} required />
        </label>
        <label className="modal-field">
          <span>{t('users.field.email')}{emailRequired ? ' *' : ''}</span>
          <input type="email" value={values.email} onChange={(event) => set('email', event.target.value)} disabled={emailReadOnly} required={emailRequired} />
        </label>
        <label className="modal-field">
          <span>{t('users.field.department')}</span>
          <input value={values.department} onChange={(event) => set('department', event.target.value)} />
        </label>
        <label className="modal-field">
          <span>{t('users.field.jobTitle')}</span>
          <input value={values.jobTitle} onChange={(event) => set('jobTitle', event.target.value)} />
        </label>
        <label className="modal-field">
          <span>{t('users.field.role')} *</span>
          <select value={values.role} onChange={(event) => set('role', event.target.value as Role)}>
            {roles.map((role) => <option key={role} value={role}>{t(roleLabels[role])}</option>)}
          </select>
        </label>
        {projects ? (
          <div className="modal-field">
            <span>{t('users.field.projectMemberships')}</span>
            <div className="member-picker">
              {projects.map((project) => {
                const readOnly = readOnlyProjectIds.includes(project.id);
                const checked = readOnly || values.projectIds.includes(project.id);
                return (
                  <label key={project.id} className="member-picker__option">
                    <input type="checkbox" checked={checked} disabled={readOnly} onChange={() => toggleProject(project.id)} />
                    <span>{project.name} · {project.leaderName}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}
        {error || fieldError ? <p className="form-error" role="alert">{error ?? fieldError}</p> : null}
        <div className="modal-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="button button--primary" disabled={submitting || !displayNameValid || (emailRequired && !emailPresent)}>{submitting ? t('common.saving') : submitLabel}</button>
        </div>
      </form>
    </div>
  );
}
