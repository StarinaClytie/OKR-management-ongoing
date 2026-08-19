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

export function TeamPage({ dataRepository = repository }: { dataRepository?: OkrRepository }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const dashboard = useDashboardData(dataRepository, currentUser?.id);
  if (!currentUser) return null;
  if (dashboard.status !== 'ready') {
    return <section className="business-page" aria-labelledby="team-page-title"><PageHeader title={t('team.title')} description={t('team.description')} /><RepositoryDataState state={dashboard} /></section>;
  }
  const data = dashboard.data;
  const teamMembers = data.users.filter((user) => can(currentUser, 'user.read', getUserPermissionScope(user)).allowed);

  return (
    <section className="business-page" aria-labelledby="team-page-title">
      <PageHeader title={t('team.title')} description={t('team.description')} primaryAction={currentUser.role === 'administrator' ? { label: t('team.manage'), onClick: () => navigate('/users') } : undefined} />
      <DataTable
        ariaLabel={t('team.members')}
        rows={teamMembers}
        getRowKey={(user) => user.id}
        emptyMessage={t('team.empty')}
        columns={[
          { key: 'name', label: t('table.member'), render: (user) => user.name },
          { key: 'title', label: t('table.title'), render: (user) => user.title },
          { key: 'department', label: t('table.department'), render: (user) => user.department },
          { key: 'projects', label: t('table.projectCount'), render: (user) => `${user.projectIds.length}` },
        ]}
      />
    </section>
  );
}
