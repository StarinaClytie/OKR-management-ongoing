import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { roleLabels } from '../auth/roleLabels';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { UserFormModal, type UserFormValues } from '../components/UserFormModal';
import type { OkrRepository, OrganizationUser, RepositoryErrorCode } from '../data/types';
import { useLocale } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';
import { repositoryErrorKey } from '../i18n/repositoryErrors';
import { adminUserService, repository } from '../lib/supabase';
import type { AdminUserService, PendingUser } from '../services/adminUserService';
import { AccessDeniedPage } from './AccessDeniedPage';

type Async<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; code: RepositoryErrorCode };

interface Feedback {
  kind: 'success' | 'error';
  key: MessageKey;
}

function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export interface UsersPageProps {
  dataRepository?: OkrRepository;
  adminUsers?: AdminUserService | undefined;
}

export function UsersPage({ dataRepository = repository, adminUsers = adminUserService }: UsersPageProps) {
  const { t } = useLocale();
  const { currentUser } = useAuth();
  const [activeState, setActiveState] = useState<Async<OrganizationUser[]>>({ status: 'loading' });
  const [pendingState, setPendingState] = useState<Async<PendingUser[]>>({ status: 'loading' });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [approveTarget, setApproveTarget] = useState<PendingUser | null>(null);
  const [editTarget, setEditTarget] = useState<OrganizationUser | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setActiveState({ status: 'loading' });
    setPendingState({ status: 'loading' });
    const pendingPromise = adminUsers ? adminUsers.listPendingUsers() : Promise.resolve({ ok: true as const, data: [] as PendingUser[] });
    const [activeResult, pendingResult] = await Promise.all([dataRepository.listOrganizationUsers(), pendingPromise]);
    setActiveState(activeResult.ok ? { status: 'ready', data: activeResult.data } : { status: 'error', code: activeResult.error.code });
    setPendingState(pendingResult.ok ? { status: 'ready', data: pendingResult.data } : { status: 'error', code: pendingResult.error.code });
  }, [dataRepository, adminUsers]);

  useEffect(() => { void load(); }, [load]);

  if (!currentUser) return null;
  if (currentUser.role !== 'administrator') return <AccessDeniedPage />;

  function openApprove(pendingUser: PendingUser) {
    setFormError(undefined);
    setApproveTarget(pendingUser);
  }

  function openEdit(user: OrganizationUser) {
    setFormError(undefined);
    setEditTarget(user);
  }

  function closeModal() {
    setApproveTarget(null);
    setEditTarget(null);
    setFormError(undefined);
    setSubmitting(false);
  }

  async function handleApprove(values: UserFormValues) {
    if (!approveTarget) return;
    setSubmitting(true);
    setFormError(undefined);
    const result = await dataRepository.approvePendingUser({
      userId: approveTarget.id,
      displayName: values.displayName,
      email: values.email,
      department: values.department,
      jobTitle: values.jobTitle,
      role: values.role,
    });
    setSubmitting(false);
    if (result.ok) {
      closeModal();
      setFeedback({ kind: 'success', key: 'users.approveSuccess' });
      await load();
    } else {
      setFormError(t(repositoryErrorKey(result.error.code)));
    }
  }

  async function handleEdit(values: UserFormValues) {
    if (!editTarget) return;
    setSubmitting(true);
    setFormError(undefined);
    const result = await dataRepository.updateUserProfile({
      userId: editTarget.id,
      displayName: values.displayName,
      email: values.email,
      department: values.department,
      jobTitle: values.jobTitle,
      role: values.role,
    });
    setSubmitting(false);
    if (result.ok) {
      closeModal();
      setFeedback({ kind: 'success', key: 'users.editSuccess' });
      await load();
    } else {
      setFormError(t(repositoryErrorKey(result.error.code)));
    }
  }

  async function toggleActive(user: OrganizationUser) {
    const result = await dataRepository.setUserActive(user.id, !user.isActive);
    if (result.ok) {
      setFeedback({ kind: 'success', key: user.isActive ? 'users.deactivateSuccess' : 'users.reactivateSuccess' });
      await load();
    } else {
      setFeedback({ kind: 'error', key: repositoryErrorKey(result.error.code) });
    }
  }

  return (
    <section className="business-page" aria-labelledby="users-page-title">
      <PageHeader title={t('users.title')} description={t('users.description')} />
      {feedback ? <p className="page-notice" role={feedback.kind === 'success' ? 'status' : 'alert'}>{t(feedback.key)}</p> : null}

      <section className="users-section" aria-labelledby="users-pending-title">
        <h2 id="users-pending-title" className="users-section__heading">{t('users.pending')}</h2>
        <p className="users-section__description">{t('users.pendingDescription')}</p>
        {pendingState.status === 'loading' ? (
          <p role="status">{t('common.loading')}</p>
        ) : pendingState.status === 'error' ? (
          <p role="alert">{t(repositoryErrorKey(pendingState.code))}</p>
        ) : (
          <DataTable
            ariaLabel={t('users.pending')}
            rows={pendingState.data}
            getRowKey={(user) => user.id}
            emptyMessage={t('users.emptyPending')}
            columns={[
              { key: 'email', label: t('users.column.email'), render: (user) => user.email },
              { key: 'createdAt', label: t('users.createdAt'), render: (user) => formatTimestamp(user.createdAt) },
              { key: 'lastSignIn', label: t('users.lastSignIn'), render: (user) => formatTimestamp(user.lastSignInAt) },
              { key: 'status', label: t('users.column.status'), render: () => <span className="users-status users-status--pending">{t('users.status.pending')}</span> },
              { key: 'actions', label: t('users.column.actions'), render: (user) => <button className="button button--secondary" onClick={() => openApprove(user)}>{t('users.configureAndApprove')}</button> },
            ]}
          />
        )}
      </section>

      <section className="users-section" aria-labelledby="users-active-title">
        <h2 id="users-active-title" className="users-section__heading">{t('users.active')}</h2>
        <p className="users-section__description">{t('users.activeDescription')}</p>
        {activeState.status === 'loading' ? (
          <p role="status">{t('common.loading')}</p>
        ) : activeState.status === 'error' ? (
          <p role="alert">{t(repositoryErrorKey(activeState.code))}</p>
        ) : (
          <DataTable
            ariaLabel={t('users.active')}
            rows={activeState.data}
            getRowKey={(user) => user.id}
            emptyMessage={t('users.emptyActive')}
            columns={[
              { key: 'name', label: t('users.column.name'), render: (user) => user.displayName },
              { key: 'email', label: t('users.column.email'), render: (user) => user.email || '—' },
              { key: 'department', label: t('users.column.department'), render: (user) => user.department },
              { key: 'jobTitle', label: t('users.column.jobTitle'), render: (user) => user.jobTitle },
              { key: 'role', label: t('users.column.role'), render: (user) => t(roleLabels[user.role]) },
              { key: 'status', label: t('users.column.status'), render: (user) => (
                <span className={`users-status users-status--${user.isActive ? 'active' : 'inactive'}`}>{user.isActive ? t('users.status.active') : t('users.status.inactive')}</span>
              ) },
              { key: 'projects', label: t('users.column.projects'), render: (user) => `${user.projectIds.length}` },
              { key: 'actions', label: t('users.column.actions'), render: (user) => (
                <div className="data-table__actions">
                  <button className="button button--secondary" onClick={() => openEdit(user)}>{t('users.edit')}</button>
                  {user.id !== currentUser.id ? <button className="button button--secondary" onClick={() => void toggleActive(user)}>{user.isActive ? t('users.deactivate') : t('users.reactivate')}</button> : null}
                </div>
              ) },
            ]}
          />
        )}
      </section>

      {approveTarget ? (
        <UserFormModal
          title={t('users.modal.approveTitle')}
          initial={{ displayName: '', email: approveTarget.email, department: '', jobTitle: '', role: 'employee' }}
          emailReadOnly
          submitLabel={t('users.approve')}
          submitting={submitting}
          error={formError}
          onSubmit={handleApprove}
          onClose={closeModal}
        />
      ) : null}

      {editTarget ? (
        <UserFormModal
          title={t('users.modal.editTitle')}
          initial={{ displayName: editTarget.displayName, email: editTarget.email, department: editTarget.department, jobTitle: editTarget.jobTitle, role: editTarget.role }}
          submitLabel={t('users.save')}
          submitting={submitting}
          error={formError}
          onSubmit={handleEdit}
          onClose={closeModal}
        />
      ) : null}
    </section>
  );
}
