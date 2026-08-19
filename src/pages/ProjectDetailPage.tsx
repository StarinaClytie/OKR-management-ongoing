import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { roleLabels } from '../auth/roleLabels';
import { ConfidentialityBadge } from '../components/ConfidentialityBadge';
import { ProjectFormModal, type ProjectFormValues } from '../components/ProjectFormModal';
import { ProjectStatusBadge } from '../components/ProjectStatusBadge';
import type { OkrRepository, OrganizationUser, ProjectDetail } from '../data/types';
import type { Role } from '../domain/types';
import { useLocale } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';
import { repositoryErrorKey } from '../i18n/repositoryErrors';
import { repository } from '../lib/supabase';
import { AccessDeniedPage } from './AccessDeniedPage';

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: ProjectDetail };

function memberStatusLabel(isActive: boolean, onboardingCompleted: boolean): MessageKey | null {
  if (!isActive) return 'users.status.inactive';
  if (!onboardingCompleted) return 'users.status.pendingOnboarding';
  return null;
}

export function ProjectDetailPage({ dataRepository = repository }: { dataRepository?: OkrRepository }) {
  const { projectId } = useParams();
  const { t } = useLocale();
  const { currentUser } = useAuth();

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const [editOpen, setEditOpen] = useState(false);
  const [leaderOpen, setLeaderOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [eligibleUsers, setEligibleUsers] = useState<OrganizationUser[]>([]);
  const [leaderSelection, setLeaderSelection] = useState('');
  const [memberSelection, setMemberSelection] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setState({ status: 'loading' });
    try {
      const result = await dataRepository.getProjectDetail(projectId);
      setState(result.ok ? { status: 'ready', data: result.data } : { status: 'error' });
    } catch {
      setState({ status: 'error' });
    }
  }, [projectId, dataRepository]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (!currentUser) return null;

  if (state.status === 'loading') {
    return (
      <section className="business-page" aria-labelledby="project-detail-title">
        <p role="status">{t('common.loading')}</p>
      </section>
    );
  }

  if (state.status === 'error') return <AccessDeniedPage />;

  const detail = state.data;
  const isAdminOrMgmt = currentUser.role === 'management' || currentUser.role === 'administrator';
  const isLeader = detail.leaderId === currentUser.id;
  const canEdit = isAdminOrMgmt || isLeader;
  const canManageMembers = isAdminOrMgmt || isLeader;
  const canChangeLeader = isAdminOrMgmt;
  const canArchive = isAdminOrMgmt;

  async function loadEligibleUsers(): Promise<OrganizationUser[]> {
    const result = await dataRepository.listOrganizationUsers();
    return result.ok ? result.data.filter((user) => user.isActive && user.approvalStatus === 'approved') : [];
  }

  function closeModals() {
    setEditOpen(false);
    setLeaderOpen(false);
    setMembersOpen(false);
    setArchiveConfirm(false);
    setFormError(undefined);
    setSubmitting(false);
  }

  async function openEdit() {
    setFormError(undefined);
    setEligibleUsers(await loadEligibleUsers());
    setEditOpen(true);
  }

  async function openLeader() {
    setFormError(undefined);
    setEligibleUsers(await loadEligibleUsers());
    setLeaderSelection(detail.leaderId);
    setLeaderOpen(true);
  }

  async function openMembers() {
    setFormError(undefined);
    setEligibleUsers(await loadEligibleUsers());
    setMemberSelection(detail.members.filter((member) => !member.isLeader).map((member) => member.id));
    setMembersOpen(true);
  }

  async function handleEdit(values: ProjectFormValues) {
    setSubmitting(true);
    setFormError(undefined);
    const result = await dataRepository.updateProject({
      projectId: detail.id,
      name: values.name,
      description: values.description,
      startDate: values.startDate,
      dueDate: values.dueDate,
      classification: values.classification,
      status: values.status,
    });
    setSubmitting(false);
    if (result.ok) {
      closeModals();
      setNotice('projects.updateSuccess');
      await refresh();
    } else {
      setFormError(t(repositoryErrorKey(result.error.code)));
    }
  }

  async function handleLeaderSubmit() {
    setSubmitting(true);
    setFormError(undefined);
    const result = await dataRepository.setProjectLeader(detail.id, leaderSelection);
    setSubmitting(false);
    if (result.ok) {
      closeModals();
      setNotice('projects.leaderChangeSuccess');
      await refresh();
    } else {
      setFormError(t(repositoryErrorKey(result.error.code)));
    }
  }

  async function handleMembersSubmit() {
    setSubmitting(true);
    setFormError(undefined);
    const result = await dataRepository.setProjectMembers(detail.id, memberSelection);
    setSubmitting(false);
    if (result.ok) {
      closeModals();
      setNotice('projects.membersSaved');
      await refresh();
    } else {
      setFormError(t(repositoryErrorKey(result.error.code)));
    }
  }

  async function handleArchiveConfirm() {
    setSubmitting(true);
    const isArchived = detail.status === 'archived';
    const result = isArchived
      ? await dataRepository.restoreProject(detail.id)
      : await dataRepository.archiveProject(detail.id);
    setSubmitting(false);
    setArchiveConfirm(false);
    if (result.ok) {
      setNotice(isArchived ? 'projects.restoreSuccess' : 'projects.archiveSuccess');
      await refresh();
    } else {
      setNotice(repositoryErrorKey(result.error.code));
    }
  }

  const currentMemberIds = detail.members.filter((member) => !member.isLeader).map((member) => member.id);
  const currentMemberById = new Map(detail.members.map((member) => [member.id, member]));
  const eligibleNonMembers = eligibleUsers.filter((user) => user.id !== detail.leaderId && !currentMemberById.has(user.id));

  function memberLabel(name: string, role: Role, isActive: boolean, onboardingCompleted: boolean): string {
    const statusKey = memberStatusLabel(isActive, onboardingCompleted);
    return statusKey ? `${name} · ${t(roleLabels[role])} · ${t(statusKey)}` : `${name} · ${t(roleLabels[role])}`;
  }

  return (
    <section className="business-page" aria-labelledby="project-detail-title">
      <Link className="text-link" to="/projects">{t('projects.detailBack')}</Link>
      <header className="page-header">
        <div>
          <p className="page-header__eyebrow">{t('common.workspace')}</p>
          <h1 id="project-detail-title">{detail.name}</h1>
          <p>{detail.description}</p>
        </div>
        <div className="page-header__actions">
          {canEdit ? <button className="button button--secondary" onClick={() => void openEdit()}>{t('projects.edit')}</button> : null}
          {canChangeLeader ? <button className="button button--secondary" onClick={() => void openLeader()}>{t('projects.changeLeader')}</button> : null}
          {canManageMembers ? <button className="button button--secondary" onClick={() => void openMembers()}>{t('projects.addMembers')}</button> : null}
          {canArchive ? (
            <button className="button button--secondary" onClick={() => setArchiveConfirm(true)}>
              {detail.status === 'archived' ? t('projects.restore') : t('projects.archive')}
            </button>
          ) : null}
        </div>
      </header>

      {notice ? <p className="page-notice" role="status">{t(notice)}</p> : null}

      <dl className="project-detail__meta">
        <dt>{t('projects.leaderLabel')}</dt>
        <dd>{detail.leaderName}</dd>
        <dt>{t('table.classification')}</dt>
        <dd><ConfidentialityBadge classification={detail.classification} /></dd>
        <dt>{t('projects.lifecycle')}</dt>
        <dd><ProjectStatusBadge status={detail.status} /></dd>
        <dt>{t('table.startDate')}</dt>
        <dd>{detail.startDate}</dd>
        <dt>{t('table.dueDate')}</dt>
        <dd>{detail.dueDate}</dd>
      </dl>

      <section className="page-section" aria-labelledby="project-team-title">
        <h2 id="project-team-title">{t('projects.team')}</h2>
        <ul className="member-list">
          <li className="member-list__row">
            <div className="member-list__identity">
              <span className="member-list__name">{detail.leaderName}</span>
              <span className="member-list__meta">{t('projects.leaderLabel')}</span>
            </div>
          </li>
          {detail.members.filter((member) => !member.isLeader).map((member) => (
            <li key={member.id} className="member-list__row">
              <div className="member-list__identity">
                <span className="member-list__name">{member.name}</span>
                <span className="member-list__meta">{memberLabel(member.name, member.role, member.isActive, member.onboardingCompleted)}</span>
              </div>
            </li>
          ))}
        </ul>
        {currentMemberIds.length === 0 ? <p className="data-table__empty">{t('projects.membersEmpty')}</p> : null}
      </section>

      <section className="page-section" aria-labelledby="project-okr-title">
        <h2 id="project-okr-title">{t('projects.okrSection')}</h2>
        <p className="data-table__empty">{t('projects.noOkr')}</p>
        <p>{t('projects.okrEmpty')}</p>
      </section>

      {editOpen ? (
        <ProjectFormModal
          title={t('projects.editTitle')}
          mode="edit"
          initial={{
            name: detail.name,
            description: detail.description,
            leaderId: detail.leaderId,
            startDate: detail.startDate,
            dueDate: detail.dueDate,
            classification: detail.classification,
            status: detail.status,
            memberIds: currentMemberIds,
          }}
          eligibleUsers={eligibleUsers}
          canEditClassification={isAdminOrMgmt}
          canEditStatus={isAdminOrMgmt}
          submitting={submitting}
          error={formError}
          onSubmit={(values) => void handleEdit(values)}
          onClose={closeModals}
        />
      ) : null}

      {leaderOpen ? (
        <div className="modal-scrim" onClick={(event) => { if (event.target === event.currentTarget) closeModals(); }}>
          <div className="modal-panel" role="dialog" aria-modal="true" aria-label={t('projects.changeLeaderTitle')}>
            <h2>{t('projects.changeLeaderTitle')}</h2>
            <label className="modal-field">
              <span>{t('projects.field.leader')} *</span>
              <select value={leaderSelection} onChange={(event) => setLeaderSelection(event.target.value)}>
                {eligibleUsers.map((user) => (
                  <option key={user.id} value={user.id}>{user.displayName} · {user.role ? t(roleLabels[user.role]) : '—'}</option>
                ))}
              </select>
            </label>
            {formError ? <p className="form-error" role="alert">{formError}</p> : null}
            <div className="modal-actions">
              <button type="button" className="button button--secondary" onClick={closeModals}>{t('common.cancel')}</button>
              <button type="button" className="button button--primary" disabled={submitting || leaderSelection === ''} onClick={() => void handleLeaderSubmit()}>
                {submitting ? t('common.saving') : t('projects.save')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {membersOpen ? (
        <div className="modal-scrim" onClick={(event) => { if (event.target === event.currentTarget) closeModals(); }}>
          <div className="modal-panel" role="dialog" aria-modal="true" aria-label={t('projects.addMemberTitle')}>
            <h2>{t('projects.addMemberTitle')}</h2>
            <div className="modal-field">
              <span>{t('projects.eligibleMembers')}</span>
              {eligibleUsers.length === 0 && currentMemberIds.length === 0 ? (
                <p className="form-error">{t('projects.noEligibleMembers')}</p>
              ) : (
                <div className="member-picker">
                  {detail.members.filter((member) => !member.isLeader).map((member) => (
                    <label key={member.id} className="member-picker__option">
                      <input
                        type="checkbox"
                        checked={memberSelection.includes(member.id)}
                        onChange={() => setMemberSelection((current) => (
                          current.includes(member.id) ? current.filter((id) => id !== member.id) : [...current, member.id]
                        ))}
                      />
                      <span>{memberLabel(member.name, member.role, member.isActive, member.onboardingCompleted)}</span>
                    </label>
                  ))}
                  {eligibleNonMembers.map((user) => (
                    <label key={user.id} className="member-picker__option">
                      <input
                        type="checkbox"
                        checked={memberSelection.includes(user.id)}
                        onChange={() => setMemberSelection((current) => (
                          current.includes(user.id) ? current.filter((id) => id !== user.id) : [...current, user.id]
                        ))}
                      />
                      <span>{user.displayName} · {user.role ? t(roleLabels[user.role]) : '—'}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {formError ? <p className="form-error" role="alert">{formError}</p> : null}
            <div className="modal-actions">
              <button type="button" className="button button--secondary" onClick={closeModals}>{t('common.cancel')}</button>
              <button type="button" className="button button--primary" disabled={submitting} onClick={() => void handleMembersSubmit()}>
                {submitting ? t('common.saving') : t('projects.save')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {archiveConfirm ? (
        <div className="modal-scrim" onClick={(event) => { if (event.target === event.currentTarget) setArchiveConfirm(false); }}>
          <div className="modal-panel" role="dialog" aria-modal="true" aria-label={t('projects.archiveConfirmTitle')}>
            <h2>{detail.status === 'archived' ? t('projects.restore') : t('projects.archiveConfirmTitle')}</h2>
            <p>{t('projects.archiveConfirmBody')}</p>
            <p className="users-delete-target">{detail.name}</p>
            <div className="modal-actions">
              <button type="button" className="button button--secondary" onClick={() => setArchiveConfirm(false)}>{t('common.cancel')}</button>
              <button type="button" className="button button--danger" disabled={submitting} onClick={() => void handleArchiveConfirm()}>
                {submitting ? t('common.saving') : detail.status === 'archived' ? t('projects.restore') : t('projects.confirmArchive')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
