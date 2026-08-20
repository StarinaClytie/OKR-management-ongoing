import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { can, getUserPermissionScope } from '../auth/permissionService';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { useLocale } from '../i18n/LocaleProvider';
import type { OkrRepository } from '../data/types';
import { useDashboardData } from '../data/useDashboardData';
import { repository } from '../lib/supabase';
import { RepositoryDataState } from '../components/RepositoryDataState';
import type { User } from '../domain/types';

export function TeamPage({ dataRepository = repository }: { dataRepository?: OkrRepository }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { currentUser, mode } = useAuth();
  const dashboard = useDashboardData(dataRepository, currentUser?.id);
  if (!currentUser) return null;
  if (dashboard.status !== 'ready') {
    return <section className="business-page" aria-labelledby="team-page-title"><PageHeader title={t('team.title')} description={t('team.description')} /><RepositoryDataState state={dashboard} /></section>;
  }
  const data = dashboard.data;

  // In Supabase mode the directory is already role-scoped by RLS/RPC; in demo
  // mode the client-side `user.read` evaluator (backed by the mock relationship
  // source) performs the same scoping.
  const visibleUsers = mode === 'supabase'
    ? data.users
    : data.users.filter((user) => can(currentUser, 'user.read', getUserPermissionScope(user)).allowed);

  const projectNameById = new Map(data.projects.map((project) => [project.id, project.name]));

  if (currentUser.role === 'administrator') {
    return (
      <section className="business-page" aria-labelledby="team-page-title">
        <PageHeader title={t('team.title')} description={t('team.description')} primaryAction={{ label: t('team.manage'), onClick: () => navigate('/users') }} />
        <DataTable
          ariaLabel={t('team.members')}
          rows={visibleUsers}
          getRowKey={(user) => user.id}
          emptyMessage={t('team.empty')}
          columns={[
            { key: 'name', label: t('table.member'), render: (user: User) => user.name },
            { key: 'title', label: t('table.title'), render: (user: User) => user.title },
            { key: 'department', label: t('table.department'), render: (user: User) => user.department },
            { key: 'projects', label: t('table.projectCount'), render: (user: User) => `${user.projectIds.length}` },
          ]}
        />
      </section>
    );
  }

  if (currentUser.role === 'management') {
    return (
      <section className="business-page" aria-labelledby="team-page-title">
        <PageHeader title={t('team.title')} description={t('team.description')} />
        <DataTable
          ariaLabel={t('team.members')}
          rows={visibleUsers}
          getRowKey={(user) => user.id}
          emptyMessage={t('team.empty')}
          columns={[
            { key: 'name', label: t('table.member'), render: (user: User) => user.name },
            { key: 'title', label: t('table.title'), render: (user: User) => user.title },
            { key: 'department', label: t('table.department'), render: (user: User) => user.department },
            { key: 'affiliations', label: t('users.column.projects'), render: (user: User) => user.projectIds.map((id) => projectNameById.get(id)).filter(Boolean).join('、') || '—' },
            { key: 'projects', label: t('table.projectCount'), render: (user: User) => `${user.projectIds.length}` },
          ]}
        />
      </section>
    );
  }

  if (currentUser.role === 'project_leader') {
    const ledProjects = data.projects.filter((project) => project.leaderId === currentUser.id);
    if (ledProjects.length === 0) {
      return <section className="business-page" aria-labelledby="team-page-title"><PageHeader title={t('team.title')} description={t('team.description')} /><p className="data-table__empty">{t('team.emptyLeader')}</p></section>;
    }
    return (
      <section className="business-page" aria-labelledby="team-page-title">
        <PageHeader title={t('team.title')} description={t('team.description')} />
        {ledProjects.map((project) => {
          const members = visibleUsers.filter((user) => user.projectIds.includes(project.id));
          return (
            <section key={project.id} className="form-card" aria-label={project.name}>
              <h2>{project.name}</h2>
              {members.length === 0 ? (
                <p className="data-table__empty">{t('team.empty')}</p>
              ) : (
                <ul className="member-list">
                  {members.map((member) => (
                    <li key={member.id} className="member-list__row">
                      <div className="member-list__identity">
                        <span className="member-list__name">{member.name}</span>
                        <span className="member-list__meta">{member.title}</span>
                      </div>
                      <span>{member.department}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </section>
    );
  }

  if (currentUser.role === 'employee') {
    const myProjects = data.projects.filter((project) => currentUser.projectIds.includes(project.id));
    if (myProjects.length === 0) {
      return <section className="business-page" aria-labelledby="team-page-title"><PageHeader title={t('team.title')} description={t('team.description')} /><p className="data-table__empty">{t('team.emptyEmployee')}</p></section>;
    }
    return (
      <section className="business-page" aria-labelledby="team-page-title">
        <PageHeader title={t('team.title')} description={t('team.description')} />
        {myProjects.map((project) => {
          const peers = visibleUsers.filter((user) => user.projectIds.includes(project.id));
          return (
            <section key={project.id} className="form-card" aria-label={project.name}>
              <h2>{project.name}</h2>
              {peers.length === 0 ? (
                <p className="data-table__empty">{t('team.empty')}</p>
              ) : (
                <ul className="member-list">
                  {peers.map((member) => (
                    <li key={member.id} className="member-list__row">
                      <div className="member-list__identity">
                        <span className="member-list__name">{member.name}</span>
                        <span className="member-list__meta">{member.title}</span>
                      </div>
                      <span>{member.department}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </section>
    );
  }

  // HR: workload visibility is served elsewhere; the team directory is minimal.
  return (
    <section className="business-page" aria-labelledby="team-page-title">
      <PageHeader title={t('team.title')} description={t('team.description')} />
      <p className="data-table__empty">{t('team.empty')}</p>
    </section>
  );
}
