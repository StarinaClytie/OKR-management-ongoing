import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissionService';
import { ConfidentialityBadge } from '../components/ConfidentialityBadge';
import { DataTable } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { ProjectStatusBadge } from '../components/ProjectStatusBadge';
import type { OkrRepository, DashboardData } from '../data/types';
import { useLocale } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';
import { repository } from '../lib/supabase';
import type { Project } from '../domain/types';

function lifecycleOf(project: Project) {
  return project.lifecycle ?? 'active';
}

/**
 * Projects is the execution-oriented view of the SAME Objective/Project entity
 * that OKR Management owns. It is intentionally read-only: objectives (and the
 * backing project record they create atomically) are created and edited in OKR
 * Management, and each row links to its canonical objective detail. This avoids
 * a second, independently-editable project record.
 */
export function ProjectsPage({ dataRepository = repository }: { dataRepository?: OkrRepository }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { currentUser, mode } = useAuth();
  const [data, setData] = useState<DashboardData | null>(() => (
    currentUser ? dataRepository.getCachedDashboardData?.(currentUser.id) ?? null : null
  ));
  const [loading, setLoading] = useState(mode === 'supabase');
  const [loadError, setLoadError] = useState<MessageKey | null>(null);
  const [showArchived, setShowArchived] = useState(false);

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
    void refresh();
  }, [currentUser, refresh]);

  if (!currentUser) return null;

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
  const isAdminOrMgmt = currentUser.role === 'management' || currentUser.role === 'administrator';

  return (
    <section className="business-page" aria-labelledby="projects-page-title">
      <PageHeader title={t('projects.title')} description={t('projects.description')} />

      <div className="filter-row">
        <span>{t('projects.filterByStatus')}</span>
        <button className="button button--secondary" type="button" onClick={() => setShowArchived((value) => !value)}>
          {showArchived ? t('projects.hideArchived') : t('projects.showArchived')}
        </button>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title={t('projects.emptyTitle')}
          description={t('projects.emptyCreateDescription')}
          primaryAction={isAdminOrMgmt ? { label: t('projects.emptyCreateAction'), onClick: () => navigate('/okrs') } : undefined}
        />
      ) : (
      <DataTable
        ariaLabel={t('projects.authorized')}
        rows={projects}
        getRowKey={(project) => project.id}
        emptyMessage={t('projects.empty')}
        columns={[
          {
            key: 'name',
            label: t('table.project'),
            render: (project) => {
              const objective = data.objectives.find((candidate) => candidate.projectId === project.id);
              return objective
                ? <Link className="text-link" to={`/okrs/${objective.id}`}>{project.name}</Link>
                : <span>{project.name}</span>;
            },
          },
          { key: 'classification', label: t('table.classification'), render: (project) => <ConfidentialityBadge classification={project.classification} /> },
          { key: 'leader', label: t('table.owner'), render: (project) => data.users.find((user) => user.id === project.leaderId)?.name ?? '—' },
          { key: 'members', label: t('table.members'), render: (project) => project.memberIds.length },
          { key: 'startDate', label: t('table.startDate'), render: (project) => project.startDate },
          { key: 'dueDate', label: t('table.dueDate'), render: (project) => project.dueDate },
          { key: 'status', label: t('table.status'), render: (project) => <ProjectStatusBadge status={lifecycleOf(project)} /> },
        ]}
      />
      )}
    </section>
  );
}
