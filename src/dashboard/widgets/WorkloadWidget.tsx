import type { DashboardData } from '../../mocks/repository';
import { prepareVisualizationData } from './visualizationData';

export interface WorkloadWidgetProps {
  data: DashboardData;
}

export function WorkloadWidget({ data }: WorkloadWidgetProps) {
  const { workloads } = prepareVisualizationData(data);

  if (workloads.length === 0) {
    return <p className="visualization-empty">当前权限范围内没有可展示的工时记录。</p>;
  }

  return (
    <div className="workload-visualization">
      <div className="workload-visualization__legend" aria-label="工时字段说明">
        <span>计划工时</span><span>已记录工时</span><span>可用容量</span>
      </div>
      {workloads.map((workload) => {
        const scale = Math.max(workload.capacityHours, workload.loggedHours, workload.plannedHours, 1);
        return (
          <article className="workload-card" key={workload.id}>
            <div className="workload-card__heading">
              <strong>{workload.memberName}</strong>
              <span className={workload.overloaded ? 'workload-state workload-state--warning' : 'workload-state'}>
                {workload.overloaded ? '超负载' : '负载正常'}
              </span>
            </div>
            <dl>
              <div>
                <dt>计划工时</dt><dd>{workload.plannedHours} 小时</dd>
                <span className="workload-bar"><i style={{ width: `${workload.plannedHours / scale * 100}%` }} /></span>
              </div>
              <div>
                <dt>已记录工时</dt><dd>{workload.loggedHours} 小时</dd>
                <span className={workload.overloaded ? 'workload-bar workload-bar--warning' : 'workload-bar'}>
                  <i style={{ width: `${workload.loggedHours / scale * 100}%` }} />
                </span>
              </div>
              <div>
                <dt>可用容量</dt><dd>{workload.capacityHours} 小时</dd>
                <span className="workload-bar workload-bar--capacity"><i style={{ width: `${workload.capacityHours / scale * 100}%` }} /></span>
              </div>
            </dl>
          </article>
        );
      })}
      {data.currentUser.role === 'hr' ? (
        <p className="dashboard-widget__notice">HR 视图仅展示授权工时与容量字段，不包含日报正文。</p>
      ) : null}
    </div>
  );
}
