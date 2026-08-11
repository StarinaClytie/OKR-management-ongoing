import { useAuth } from '../auth/AuthContext';
import { can, getUserPermissionScope } from '../auth/permissionService';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { mockRepository } from '../mocks/repository';

export function TeamPage() {
  const { currentUser } = useAuth();
  if (!currentUser) return null;
  const data = mockRepository.getDashboardData(currentUser.id);
  const teamMembers = data.users.filter((user) => can(currentUser, 'user.read', getUserPermissionScope(user)).allowed);

  return (
    <section className="business-page" aria-labelledby="team-page-title">
      <PageHeader title="团队" description="按当前角色展示团队成员与项目归属；人员权限变更仅由管理员处理。" primaryAction={currentUser.role === 'administrator' ? { label: '管理用户', onClick: () => undefined } : undefined} />
      <DataTable
        ariaLabel="团队成员"
        rows={teamMembers}
        getRowKey={(user) => user.id}
        emptyMessage="当前没有可显示的团队成员。"
        columns={[
          { key: 'name', label: '成员', render: (user) => user.name },
          { key: 'title', label: '职位', render: (user) => user.title },
          { key: 'department', label: '部门', render: (user) => user.department },
          { key: 'projects', label: '项目数', render: (user) => `${user.projectIds.length}` },
        ]}
      />
    </section>
  );
}
