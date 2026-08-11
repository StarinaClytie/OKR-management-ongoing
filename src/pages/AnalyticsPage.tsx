import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissionService';
import { DataTable } from '../components/DataTable';
import { MetricCard } from '../components/MetricCard';
import { PageHeader } from '../components/PageHeader';
import { mockRepository } from '../mocks/repository';

export function AnalyticsPage() {
  const { currentUser } = useAuth();
  if (!currentUser) return null;
  const data = mockRepository.getDashboardData(currentUser.id);
  const workloads = data.workloads.filter((workload) => can(currentUser, 'worklog.read_hours', workload).allowed);
  const totalLoggedHours = workloads.reduce((total, workload) => total + workload.loggedHours, 0);
  const totalCapacity = workloads.reduce((total, workload) => total + workload.capacityHours, 0);

  return (
    <section className="business-page" aria-labelledby="analytics-page-title">
      <PageHeader title="分析" description="使用当前权限范围内的进度与工时数据识别投入和容量差异。" />
      <div className="metric-row"><MetricCard label="已记录工时" value={`${totalLoggedHours}h`} detail="授权范围内" /><MetricCard label="可用容量" value={`${totalCapacity}h`} detail="当前周期" /></div>
      <DataTable
        ariaLabel="授权负载分析"
        rows={workloads}
        getRowKey={(workload) => workload.id}
        emptyMessage="当前没有可分析的授权工时。"
        columns={[
          { key: 'member', label: '成员', render: (workload) => data.users.find((user) => user.id === workload.userId)?.name ?? '—' },
          { key: 'planned', label: '计划工时', render: (workload) => `${workload.plannedHours} 小时` },
          { key: 'logged', label: '已记录工时', render: (workload) => `${workload.loggedHours} 小时` },
          { key: 'capacity', label: '容量', render: (workload) => `${workload.capacityHours} 小时` },
        ]}
      />
    </section>
  );
}
