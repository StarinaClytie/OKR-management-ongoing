import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissionService';
import { ConfidentialityBadge } from '../components/ConfidentialityBadge';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { useLocale } from '../i18n/LocaleProvider';
import type { OkrRepository } from '../data/types';
import { useDashboardData } from '../data/useDashboardData';
import { repository } from '../lib/supabase';
import { RepositoryDataState } from '../components/RepositoryDataState';

export function ProjectsPage({ dataRepository = repository }: { dataRepository?: OkrRepository }) {
  const { t } = useLocale();
  const { currentUser } = useAuth();
  const dashboard = useDashboardData(dataRepository, currentUser?.id);
  if (!currentUser) return null;
  if (dashboard.status !== 'ready') {
    return <section className="business-page" aria-labelledby="projects-page-title"><PageHeader title={t('projects.title')} description={t('projects.description')} /><RepositoryDataState state={dashboard} /></section>;
  }
  const data = dashboard.data;
  const visibleProjects = data.projects.filter((project) => can(currentUser, 'okr.read_detail', project).allowed);
  const canManageProject = visibleProjects.some((project) => can(currentUser, 'project.manage', project).allowed);

  return (
    <section className="business-page" aria-labelledby="projects-page-title">
      <PageHeader
        title={t('projects.title')}
        description={t('projects.description')}
        primaryAction={canManageProject ? { label: t('projects.create'), onClick: () => undefined } : undefined}
      />
      <div className="filter-row"><span>{t('projects.filterByStatus')}</span><strong>{t('projects.active')}</strong><button className="button button--secondary" type="button">{t('projects.moreFilters')}</button></div>
      <DataTable
        ariaLabel={t('projects.authorized')}
        rows={visibleProjects}
        getRowKey={(project) => project.id}
        emptyMessage={t('projects.empty')}
        columns={[
          { key: 'name', label: t('table.project'), render: (project) => project.name },
          { key: 'classification', label: t('table.classification'), render: (project) => <ConfidentialityBadge classification={project.classification} /> },
          { key: 'leader', label: t('table.owner'), render: (project) => data.users.find((user) => user.id === project.leaderId)?.name ?? '—' },
          { key: 'status', label: t('table.status'), render: (project) => <StatusBadge status={project.status} /> },
        ]}
      />
    </section>
  );
}
