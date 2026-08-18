import { useCallback, useEffect, useMemo, useState } from 'react';
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
import type { AdminUserService, DeleteUserErrorCode, InviteUserErrorCode, MemberOnboardingState, PendingUser, ResendInvitationErrorCode } from '../services/adminUserService';
import { AccessDeniedPage } from './AccessDeniedPage';

type Async<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; code: RepositoryErrorCode };

type UserStatus = 'onboarding' | 'active' | 'inactive';

interface Feedback {
  kind: 'success' | 'error';
  key: MessageKey;
  values?: Record<string, string | number>;
}

function inviteErrorKey(code: InviteUserErrorCode): MessageKey {
  switch (code) {
    case 'unauthorized':
      return 'users.inviteUnauthorized';
    case 'invalid_email':
      return 'users.inviteInvalidEmail';
    case 'provisioning_failed':
      return 'users.inviteProvisioningFailed';
    case 'recovery_invite_failed':
      return 'users.inviteRecoveryInviteFailed';
    default:
      return 'users.inviteFailed';
  }
}

function resendErrorKey(code: ResendInvitationErrorCode): MessageKey {
  switch (code) {
    case 'unauthorized':
      return 'users.resendUnauthorized';
    default:
      return 'users.resendFailed';
  }
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

function statusOf(user: OrganizationUser, onboardingCompletedById: Map<string, boolean>): UserStatus {
  if (!user.isActive) return 'inactive';
  return onboardingCompletedById.get(user.id) === false ? 'onboarding' : 'active';
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
  const [onboardingStates, setOnboardingStates] = useState<MemberOnboardingState[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [approveTarget, setApproveTarget] = useState<PendingUser | null>(null);
  const [editTarget, setEditTarget] = useState<OrganizationUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrganizationUser | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setActiveState({ status: 'loading' });
    setPendingState({ status: 'loading' });
    const adminPromise = adminUsers
      ? adminUsers.listAdminUsers()
      : Promise.resolve({ ok: true as const, data: { pendingUsers: [] as PendingUser[], onboardingStates: [] as MemberOnboardingState[] } });
    const [activeResult, adminResult] = await Promise.all([dataRepository.listOrganizationUsers(), adminPromise]);
    setActiveState(activeResult.ok ? { status: 'ready', data: activeResult.data } : { status: 'error', code: activeResult.error.code });
    if (adminResult.ok) {
      setPendingState({ status: 'ready', data: adminResult.data.pendingUsers });
      setOnboardingStates(adminResult.data.onboardingStates);
    } else {
      setPendingState({ status: 'error', code: adminResult.error.code });
      setOnboardingStates([]);
    }
  }, [dataRepository, adminUsers]);

  useEffect(() => { void load(); }, [load]);

  const onboardingCompletedById = useMemo(() => new Map(onboardingStates.map((state) => [state.id, state.onboardingCompleted])), [onboardingStates]);

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

  function openDelete(user: OrganizationUser) {
    setDeleteTarget(user);
  }

  function closeModal() {
    setApproveTarget(null);
    setEditTarget(null);
    setInviteOpen(false);
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

  function openInvite() {
    setFormError(undefined);
    setInviteOpen(true);
  }

  function closeInvite() {
    setInviteOpen(false);
    setFormError(undefined);
    setSubmitting(false);
  }

  async function handleInviteSubmit(values: UserFormValues) {
    if (!adminUsers) return;
    setSubmitting(true);
    setFormError(undefined);
    const result = await adminUsers.inviteUser({
      email: values.email,
      displayName: values.displayName,
      department: values.department,
      jobTitle: values.jobTitle,
      role: values.role,
    });
    setSubmitting(false);
    if (result.ok) {
      closeInvite();
      if (result.outcome === 'invited') {
        setFeedback({ kind: 'success', key: 'users.inviteSuccess', values: { email: result.email } });
        await load();
      } else if (result.outcome === 'recovered') {
        setFeedback({
          kind: 'success',
          key: result.invitationSent ? 'users.inviteRecoveredResent' : 'users.inviteRecovered',
        });
        await load();
      } else {
        setFeedback({ kind: 'error', key: 'users.inviteAlreadyMember' });
      }
    } else {
      setFormError(t(inviteErrorKey(result.error.code)));
    }
  }

  async function handleResend(user: OrganizationUser) {
    if (!adminUsers) return;
    const result = await adminUsers.resendInvitation(user.id);
    if (result.ok) {
      setFeedback({
        kind: result.outcome === 'resent' ? 'success' : 'error',
        key: result.outcome === 'resent' ? 'users.resendSuccess' : 'users.resendAlreadyCompleted',
      });
    } else {
      setFeedback({ kind: 'error', key: resendErrorKey(result.error.code) });
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

  function renderActions(user: OrganizationUser) {
    const isSelf = user.id === currentUser!.id;
    const status = statusOf(user, onboardingCompletedById);
    return (
      <div className="data-table__actions">
        <button className="button button--secondary" onClick={() => openEdit(user)}>{t('users.edit')}</button>
        {!isSelf && adminUsers && status === 'onboarding' ? (
          <button className="button button--secondary" onClick={() => void handleResend(user)}>{t('users.resendInvitation')}</button>
        ) : null}
        {!isSelf ? (
          <button className="button button--secondary" onClick={() => void toggleActive(user)}>{status === 'inactive' ? t('users.reactivate') : t('users.deactivate')}</button>
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
        primaryAction={adminUsers ? { label: t('users.invite'), onClick: openInvite } : undefined}
      />
      {feedback ? <p className="page-notice" role={feedback.kind === 'success' ? 'status' : 'alert'}>{t(feedback.key, feedback.values)}</p> : null}

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
              { key: 'status', label: t('users.column.status'), render: (user) => {
                const status = statusOf(user, onboardingCompletedById);
                const statusLabel = status === 'inactive' ? 'users.status.inactive' : status === 'onboarding' ? 'users.status.pendingOnboarding' : 'users.status.active';
                return <span className={`users-status users-status--${status}`}>{t(statusLabel)}</span>;
              } },
              { key: 'projects', label: t('users.column.projects'), render: (user) => `${user.projectIds.length}` },
              { key: 'actions', label: t('users.column.actions'), render: (user) => renderActions(user) },
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

      {inviteOpen ? (
        <UserFormModal
          title={t('users.modal.inviteTitle')}
          initial={{ displayName: '', email: '', department: '', jobTitle: '', role: 'employee' }}
          emailRequired
          submitLabel={t('users.inviteSend')}
          submitting={submitting}
          error={formError}
          onSubmit={handleInviteSubmit}
          onClose={closeInvite}
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
