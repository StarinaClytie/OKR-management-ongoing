import { useAuth } from '../auth/AuthContext';
import { can, getUserPermissionScope } from '../auth/permissionService';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { mockRepository } from '../mocks/repository';
import { useLocale } from '../i18n/LocaleProvider';

export function TeamPage() {
  const { t } = useLocale();
  const { currentUser } = useAuth();
  if (!currentUser) return null;
  const data = mockRepository.getDashboardData(currentUser.id);
  const teamMembers = data.users.filter((user) => can(currentUser, 'user.read', getUserPermissionScope(user)).allowed);

  return (
    <section className="business-page" aria-labelledby="team-page-title">
      <PageHeader title={t('team.title')} description={t('team.description')} primaryAction={currentUser.role === 'administrator' ? { label: t('team.manage'), onClick: () => undefined } : undefined} />
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
