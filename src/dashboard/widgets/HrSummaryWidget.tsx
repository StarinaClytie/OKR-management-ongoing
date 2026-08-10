import { PermissionGate } from '../../auth/PermissionGate';
import { MetricCard } from '../../components/MetricCard';
import type { DashboardData } from '../../mocks/repository';
import { users } from '../../mocks/users';

export interface HrSummaryWidgetProps {
  data: DashboardData;
}

export function HrSummaryWidget({ data }: HrSummaryWidgetProps) {
  const overloadedCount = data.workloads.filter((workload) => workload.loggedHours > workload.capacityHours).length;
  const submissionRate = 100;

  return (
    <section className="dashboard-widget dashboard-widget--wide" aria-labelledby="hr-summary-title">
      <div className="dashboard-widget__header">
        <div>
          <p className="dashboard-widget__eyebrow">授权人员数据</p>
          <h2 id="hr-summary-title">授权工时与团队负载摘要</h2>
        </div>
      </div>
      <div className="dashboard-metrics">
        <MetricCard label="日报提交率" value={`${submissionRate}%`} detail="本周授权范围" />
        <MetricCard label="超负载人员" value={overloadedCount} detail="记录工时高于容量" />
        <MetricCard label="授权工时记录" value={data.workloads.length} detail="仅显示投入字段" />
      </div>
      <div className="workload-summary" aria-label="授权工时列表">
        {data.workloads.map((workload) => {
          const user = users.find((candidate) => candidate.id === workload.userId);
          const overloaded = workload.loggedHours > workload.capacityHours;

          return (
            <PermissionGate key={workload.id} action="worklog.read_hours" resource={workload}>
              <article className="workload-row">
                <div>
                  <strong>{user?.name ?? '成员'}</strong>
                  <span>{workload.periodStart} 至 {workload.periodEnd}</span>
                </div>
                <dl>
                  <div><dt>计划</dt><dd>{workload.plannedHours} 小时</dd></div>
                  <div><dt>已记录</dt><dd>{workload.loggedHours} 小时</dd></div>
                  <div><dt>容量</dt><dd>{workload.capacityHours} 小时</dd></div>
                </dl>
                <span className={overloaded ? 'workload-state workload-state--warning' : 'workload-state'}>
                  {overloaded ? '超负载' : '负载正常'}
                </span>
              </article>
            </PermissionGate>
          );
        })}
      </div>
    </section>
  );
}
