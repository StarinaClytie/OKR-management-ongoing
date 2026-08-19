import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissionService';
import { ConfidentialityBadge } from '../components/ConfidentialityBadge';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { ProjectFormModal, type ProjectFormValues } from '../components/ProjectFormModal';
import { ProjectStatusBadge } from '../components/ProjectStatusBadge';
import type { OkrRepository, OrganizationUser } from '../data/types';
import { useLocale } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';
import { repositoryErrorKey } from '../i18n/repositoryErrors';
import { repository } from '../lib/supabase';
import { mockRepository, type DashboardData } from '../mocks/repository';
import type { Project } from '../domain/types';

function lifecycleOf(project: Project) {
  return project.lifecycle ?? 'active';
}

export function ProjectsPage({ dataRepository = repository }: { dataRepository?: OkrRepository }) {
  const { t } = useLocale();
  const { currentUser, mode } = useAuth();
  const [data, setData] = useState<DashboardData | null>(() => (
    currentUser && mode === 'demo' ? mockRepository.getDashboardData(currentUser.id) : null
  ));
  const [loading, setLoading] = useState(mode === 'supabase');
  const [loadError, setLoadError] = useState<MessageKey | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [notice, setNotice] = useState<MessageKey | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Project | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Project | null>(null);
  const [eligibleUsers, setEligibleUsers] = useState<OrganizationUser[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const result = await dataRepository.getDashboardData(currentUser.id);
      if (!result.ok) {
        setLoadError('common.requestFailed');
        return;
      }
      setLoadError(null);
      setData(result.data);
    } catch {
      setLoadError('common.requestFailed');
    } finally {
      setLoading(false);
    }
  }, [currentUser, dataRepository]);

  useEffect(() => {
    if (!currentUser) return;
    if (mode === 'demo') {
      setData(mockRepository.getDashboardData(currentUser.id));
      setLoading(false);
      return;
    }
    void refresh();
  }, [currentUser, mode, refresh]);

  if (!currentUser) return null;

  const isAdminOrMgmt = currentUser.role === 'management' || currentUser.role === 'administrator';

  async function loadEligibleUsers(): Promise<OrganizationUser[]> {
    const result = await dataRepository.listOrganizationUsers();
    return result.ok ? result.data.filter((user) => user.isActive && user.approvalStatus === 'approved') : [];
  }

  function closeModals() {
    setCreateOpen(false);
    setEditTarget(null);
    setArchiveTarget(null);
    setFormError(undefined);
    setSubmitting(false);
  }

  async function openCreate() {
    setFormError(undefined);
    setEligibleUsers(await loadEligibleUsers());
    setCreateOpen(true);
  }

  async function openEdit(project: Project) {
    setFormError(undefined);
    setEligibleUsers(await loadEligibleUsers());
    setEditTarget(project);
  }

  async function handleCreate(values: ProjectFormValues) {
    setSubmitting(true);
    setFormError(undefined);
    const result = await dataRepository.createProject({
      name: values.name,
      description: values.description,
      leaderId: values.leaderId,
      startDate: values.startDate,
      dueDate: values.dueDate,
      classification: values.classification,
      status: values.status,
      memberIds: values.memberIds,
    });
    setSubmitting(false);
    if (result.ok) {
      closeModals();
      setNotice('projects.createSuccess');
      await refresh();
    } else {
      setFormError(t(repositoryErrorKey(result.error.code)));
    }
  }

  async function handleEdit(values: ProjectFormValues) {
    if (!editTarget) return;
    setSubmitting(true);
    setFormError(undefined);
    const result = await dataRepository.updateProject({
      projectId: editTarget.id,
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

  async function handleArchiveConfirm() {
    if (!archiveTarget) return;
    setSubmitting(true);
    const isArchived = lifecycleOf(archiveTarget) === 'archived';
    const result = isArchived
      ? await dataRepository.restoreProject(archiveTarget.id)
      : await dataRepository.archiveProject(archiveTarget.id);
    setSubmitting(false);
    setArchiveTarget(null);
    if (result.ok) {
      setNotice(isArchived ? 'projects.restoreSuccess' : 'projects.archiveSuccess');
      await refresh();
    } else {
      setNotice(repositoryErrorKey(result.error.code));
    }
  }

  if (loading || loadError || !data) {
    return (
      <section className="business-page" aria-labelledby="projects-page-title">
        <PageHeader title={t('projects.title')} description={t('projects.description')} />
        {loading ? <p role="status">{t('common.loading')}</p> : loadError ? <p role="alert">{t(loadError)}</p> : null}
      </section>
    );
  }

  const visibleProjects = data.projects.filter((project) => can(currentUser, 'okr.read_detail', project).allowed);
  const projects = visibleProjects.filter((project) => showArchived || lifecycleOf(project) !== 'archived');

  function canEdit(project: Project): boolean {
    return isAdminOrMgmt || project.leaderId === currentUser!.id;
  }

  return (
    <section className="business-page" aria-labelledby="projects-page-title">
      <PageHeader
        title={t('projects.title')}
        description={t('projects.description')}
        primaryAction={isAdminOrMgmt ? { label: t('projects.create'), onClick: () => void openCreate() } : undefined}
      />
      {notice ? <p className="page-notice" role={notice === 'common.requestFailed' || notice === 'common.requestUnauthorized' ? 'alert' : 'status'}>{t(notice)}</p> : null}

      <div className="filter-row">
        <span>{t('projects.filterByStatus')}</span>
        <button className="button button--secondary" type="button" onClick={() => setShowArchived((value) => !value)}>
          {showArchived ? t('projects.hideArchived') : t('projects.showArchived')}
        </button>
      </div>

      <DataTable
        ariaLabel={t('projects.authorized')}
        rows={projects}
        getRowKey={(project) => project.id}
        emptyMessage={t('projects.empty')}
        columns={[
          { key: 'name', label: t('table.project'), render: (project) => <Link className="text-link" to={`/projects/${project.id}`}>{project.name}</Link> },
          { key: 'classification', label: t('table.classification'), render: (project) => <ConfidentialityBadge classification={project.classification} /> },
          { key: 'leader', label: t('table.owner'), render: (project) => data.users.find((user) => user.id === project.leaderId)?.name ?? '—' },
          { key: 'members', label: t('table.members'), render: (project) => project.memberIds.length },
          { key: 'startDate', label: t('table.startDate'), render: (project) => project.startDate },
          { key: 'dueDate', label: t('table.dueDate'), render: (project) => project.dueDate },
          { key: 'status', label: t('table.status'), render: (project) => <ProjectStatusBadge status={lifecycleOf(project)} /> },
          {
            key: 'actions',
            label: t('users.column.actions'),
            render: (project) => (
              <div className="data-table__actions">
                {canEdit(project) ? <button className="button button--secondary" onClick={() => void openEdit(project)}>{t('projects.edit')}</button> : null}
                {isAdminOrMgmt ? (
                  <button className="button button--secondary" onClick={() => setArchiveTarget(project)}>
                    {lifecycleOf(project) === 'archived' ? t('projects.restore') : t('projects.archive')}
                  </button>
                ) : null}
              </div>
            ),
          },
        ]}
      />

      {createOpen ? (
        <ProjectFormModal
          title={t('projects.createTitle')}
          mode="create"
          initial={{ name: '', description: '', leaderId: '', startDate: '', dueDate: '', classification: 'internal', status: 'active', memberIds: [] }}
          eligibleUsers={eligibleUsers}
          canEditClassification
          canEditStatus
          submitting={submitting}
          error={formError}
          onSubmit={(values) => void handleCreate(values)}
          onClose={closeModals}
        />
      ) : null}

      {editTarget ? (
        <ProjectFormModal
          title={t('projects.editTitle')}
          mode="edit"
          initial={{
            name: editTarget.name,
            description: editTarget.description,
            leaderId: editTarget.leaderId,
            startDate: editTarget.startDate,
            dueDate: editTarget.dueDate,
            classification: editTarget.classification,
            status: lifecycleOf(editTarget),
            memberIds: editTarget.memberIds,
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

      {archiveTarget ? (
        <div className="modal-scrim" onClick={(event) => { if (event.target === event.currentTarget) setArchiveTarget(null); }}>
          <div className="modal-panel" role="dialog" aria-modal="true" aria-label={t('projects.archiveConfirmTitle')}>
            <h2>{lifecycleOf(archiveTarget) === 'archived' ? t('projects.restore') : t('projects.archiveConfirmTitle')}</h2>
            <p>{t('projects.archiveConfirmBody')}</p>
            <p className="users-delete-target">{archiveTarget.name}</p>
            <div className="modal-actions">
              <button type="button" className="button button--secondary" onClick={() => setArchiveTarget(null)}>{t('common.cancel')}</button>
              <button type="button" className="button button--danger" disabled={submitting} onClick={() => void handleArchiveConfirm()}>
                {submitting ? t('common.saving') : lifecycleOf(archiveTarget) === 'archived' ? t('projects.restore') : t('projects.confirmArchive')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
