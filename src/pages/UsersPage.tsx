import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { roleLabels } from '../auth/roleLabels';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { UserFormModal, type UserFormValues } from '../components/UserFormModal';
import type { OkrRepository, OrganizationUser, RepositoryErrorCode } from '../data/types';
import type { Role } from '../domain/types';
import { useLocale } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';
import { repositoryErrorKey } from '../i18n/repositoryErrors';
import { adminUserService, repository } from '../lib/supabase';
import type { AdminUserService, DeleteUserErrorCode } from '../services/adminUserService';
import { AccessDeniedPage } from './AccessDeniedPage';

type Async<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; code: RepositoryErrorCode };

interface Feedback {
  kind: 'success' | 'error';
  key: MessageKey;
  values?: Record<string, string | number>;
}

function deleteErrorKey(code: DeleteUserErrorCode): MessageKey {
  switch (code) {
    case 'unauthorized':
      return 'users.deleteUnauthorized';
    case 'self_delete':
      return 'users.deleteSelf';
    default:
      return 'users.deleteFailed';
  }
}

function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function roleLabel(role: Role | null, t: (key: MessageKey) => string): string {
  return role ? t(roleLabels[role]) : '—';
}

export interface UsersPageProps {
  dataRepository?: OkrRepository;
  adminUsers?: AdminUserService | undefined;
}

export function UsersPage({ dataRepository = repository, adminUsers = adminUserService }: UsersPageProps) {
  const { t } = useLocale();
  const { currentUser } = useAuth();
  const [usersState, setUsersState] = useState<Async<OrganizationUser[]>>({ status: 'loading' });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [approveTarget, setApproveTarget] = useState<OrganizationUser | null>(null);
  const [editTarget, setEditTarget] = useState<OrganizationUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrganizationUser | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setUsersState({ status: 'loading' });
    const result = await dataRepository.listOrganizationUsers();
    setUsersState(result.ok ? { status: 'ready', data: result.data } : { status: 'error', code: result.error.code });
  }, [dataRepository]);

  useEffect(() => { void load(); }, [load]);

  const pendingUsers = useMemo(() => (
    usersState.status === 'ready' ? usersState.data.filter((user) => user.approvalStatus === 'pending') : []
  ), [usersState]);
  const approvedUsers = useMemo(() => (
    usersState.status === 'ready' ? usersState.data.filter((user) => user.approvalStatus === 'approved') : []
  ), [usersState]);

  if (!currentUser) return null;
  if (currentUser.role !== 'administrator') return <AccessDeniedPage />;

  function openApprove(pendingUser: OrganizationUser) {
    setFormError(undefined);
    setApproveTarget(pendingUser);
  }

  function openEdit(user: OrganizationUser) {
    setFormError(undefined);
    setEditTarget(user);
  }

  function openDelete(user: OrganizationUser) {
    setDeleteTarget(user);
  }

  function closeModal() {
    setApproveTarget(null);
    setEditTarget(null);
    setDeleteTarget(null);
    setFormError(undefined);
    setSubmitting(false);
  }

  async function handleApprove(values: UserFormValues) {
    if (!approveTarget) return;
    setSubmitting(true);
    setFormError(undefined);
    const result = await dataRepository.approvePendingUser({
      userId: approveTarget.id,
      role: values.role,
      department: values.department,
      jobTitle: values.jobTitle,
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

  async function handleReject(pendingUser: OrganizationUser) {
    setSubmitting(true);
    setFormError(undefined);
    const result = await dataRepository.rejectPendingUser(pendingUser.id);
    setSubmitting(false);
    if (result.ok) {
      setFeedback({ kind: 'success', key: 'users.rejectSuccess' });
      await load();
    } else {
      setFeedback({ kind: 'error', key: 'users.rejectFailed' });
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

  async function handleDeleteConfirm() {
    if (!deleteTarget || !adminUsers) return;
    setSubmitting(true);
    const result = await adminUsers.deleteUser(deleteTarget.id);
    setSubmitting(false);
    setDeleteTarget(null);
    if (result.ok) {
      setFeedback({ kind: 'success', key: 'users.deleteSuccess' });
      await load();
    } else {
      setFeedback({ kind: 'error', key: deleteErrorKey(result.error.code) });
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

  function renderPendingActions(user: OrganizationUser) {
    return (
      <div className="data-table__actions">
        <button className="button button--secondary" onClick={() => openApprove(user)}>{t('users.configureAndApprove')}</button>
        <button className="button button--secondary" disabled={submitting} onClick={() => void handleReject(user)}>{t('users.reject')}</button>
      </div>
    );
  }

  function renderApprovedActions(user: OrganizationUser) {
    const isSelf = user.id === currentUser!.id;
    return (
      <div className="data-table__actions">
        <button className="button button--secondary" onClick={() => openEdit(user)}>{t('users.edit')}</button>
        {!isSelf ? (
          <button className="button button--secondary" onClick={() => void toggleActive(user)}>{user.isActive ? t('users.deactivate') : t('users.reactivate')}</button>
        ) : null}
        {!isSelf && adminUsers ? (
          <button className="text-button text-button--danger" onClick={() => openDelete(user)}>{t('users.deleteAccount')}</button>
        ) : null}
      </div>
    );
  }

  return (
    <section className="business-page" aria-labelledby="users-page-title">
      <PageHeader
        title={t('users.title')}
        description={t('users.description')}
      />
      {feedback ? <p className="page-notice" role={feedback.kind === 'success' ? 'status' : 'alert'}>{t(feedback.key, feedback.values)}</p> : null}

      <section className="users-section" aria-labelledby="users-pending-title">
        <h2 id="users-pending-title" className="users-section__heading">{t('users.pending')}</h2>
        <p className="users-section__description">{t('users.pendingDescription')}</p>
        {usersState.status === 'loading' ? (
          <p role="status">{t('common.loading')}</p>
        ) : usersState.status === 'error' ? (
          <p role="alert">{t(repositoryErrorKey(usersState.code))}</p>
        ) : (
          <DataTable
            ariaLabel={t('users.pending')}
            rows={pendingUsers}
            getRowKey={(user) => user.id}
            emptyMessage={t('users.emptyPending')}
            columns={[
              { key: 'name', label: t('users.column.name'), render: (user) => user.displayName },
              { key: 'email', label: t('users.column.email'), render: (user) => user.email || '—' },
              { key: 'createdAt', label: t('users.createdAt'), render: (user) => formatTimestamp(user.createdAt) },
              { key: 'status', label: t('users.column.status'), render: () => <span className="users-status users-status--pending">{t('users.status.pending')}</span> },
              { key: 'actions', label: t('users.column.actions'), render: (user) => renderPendingActions(user) },
            ]}
          />
        )}
      </section>

      <section className="users-section" aria-labelledby="users-active-title">
        <h2 id="users-active-title" className="users-section__heading">{t('users.active')}</h2>
        <p className="users-section__description">{t('users.activeDescription')}</p>
        {usersState.status === 'loading' ? (
          <p role="status">{t('common.loading')}</p>
        ) : usersState.status === 'error' ? (
          <p role="alert">{t(repositoryErrorKey(usersState.code))}</p>
        ) : (
          <DataTable
            ariaLabel={t('users.active')}
            rows={approvedUsers}
            getRowKey={(user) => user.id}
            emptyMessage={t('users.emptyActive')}
            columns={[
              { key: 'name', label: t('users.column.name'), render: (user) => user.displayName },
              { key: 'email', label: t('users.column.email'), render: (user) => user.email || '—' },
              { key: 'department', label: t('users.column.department'), render: (user) => user.department },
              { key: 'jobTitle', label: t('users.column.jobTitle'), render: (user) => user.jobTitle },
              { key: 'role', label: t('users.column.role'), render: (user) => roleLabel(user.role, t) },
              { key: 'status', label: t('users.column.status'), render: (user) => {
                const status = user.isActive ? 'active' : 'inactive';
                const statusLabel = status === 'inactive' ? 'users.status.inactive' : 'users.status.active';
                return <span className={`users-status users-status--${status}`}>{t(statusLabel)}</span>;
              } },
              { key: 'projects', label: t('users.column.projects'), render: (user) => `${user.projectIds.length}` },
              { key: 'actions', label: t('users.column.actions'), render: (user) => renderApprovedActions(user) },
            ]}
          />
        )}
      </section>

      {approveTarget ? (
        <UserFormModal
          title={t('users.modal.approveTitle')}
          initial={{ displayName: approveTarget.displayName, email: approveTarget.email, department: '', jobTitle: '', role: 'employee' }}
          nameReadOnly
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
          initial={{ displayName: editTarget.displayName, email: editTarget.email, department: editTarget.department, jobTitle: editTarget.jobTitle, role: editTarget.role ?? 'employee' }}
          submitLabel={t('users.save')}
          submitting={submitting}
          error={formError}
          onSubmit={handleEdit}
          onClose={closeModal}
        />
      ) : null}

      {deleteTarget ? (
        <div className="modal-scrim" onClick={(event) => { if (event.target === event.currentTarget) setDeleteTarget(null); }}>
          <div className="modal-panel" role="dialog" aria-modal="true" aria-label={t('users.modal.deleteTitle')}>
            <h2>{t('users.modal.deleteTitle')}</h2>
            <p>{t('users.modal.deleteBody')}</p>
            <p className="users-delete-target">{deleteTarget.displayName} · {deleteTarget.email || '—'}</p>
            <div className="modal-actions">
              <button type="button" className="button button--secondary" onClick={() => setDeleteTarget(null)}>{t('common.cancel')}</button>
              <button type="button" className="button button--danger" disabled={submitting} onClick={() => void handleDeleteConfirm()}>{submitting ? t('common.saving') : t('users.deleteConfirm')}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
