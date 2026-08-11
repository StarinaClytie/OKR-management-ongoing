import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissionService';
import { ConfidentialityBadge } from '../components/ConfidentialityBadge';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { RestrictedContent } from '../components/RestrictedContent';
import { StatusBadge } from '../components/StatusBadge';
import { mockRepository } from '../mocks/repository';

export function ProjectsPage() {
  const { currentUser } = useAuth();
  if (!currentUser) return null;
  const data = mockRepository.getDashboardData(currentUser.id);
  const visibleProjects = data.projects.filter((project) => can(currentUser, 'okr.read_detail', project).allowed);
  const hiddenProjectCount = data.projects.length - visibleProjects.length;
  const canManageProject = visibleProjects.some((project) => can(currentUser, 'project.manage', project).allowed);

  return (
    <section className="business-page" aria-labelledby="projects-page-title">
      <PageHeader
        title="项目"
        description="项目列表按密级和成员关系过滤；受限项目不会暴露名称或摘要。"
        primaryAction={canManageProject ? { label: '新建项目', onClick: () => undefined } : undefined}
      />
      <div className="filter-row"><span>按状态查看</span><strong>进行中</strong><button className="button button--secondary" type="button">更多筛选</button></div>
      <DataTable
        ariaLabel="授权项目"
        rows={visibleProjects}
        getRowKey={(project) => project.id}
        emptyMessage="当前没有可查看的项目。"
        columns={[
          { key: 'name', label: '项目', render: (project) => project.name },
          { key: 'classification', label: '密级', render: (project) => <ConfidentialityBadge classification={project.classification} /> },
          { key: 'leader', label: '负责人', render: (project) => data.users.find((user) => user.id === project.leaderId)?.name ?? '—' },
          { key: 'status', label: '状态', render: (project) => <StatusBadge status={project.status} /> },
        ]}
      />
      {hiddenProjectCount > 0 && <RestrictedContent classification="confidential" />}
    </section>
  );
}
