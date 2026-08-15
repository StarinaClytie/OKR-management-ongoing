import type { CSSProperties } from 'react';
import { StatusBadge } from '../../components/StatusBadge';
import type { DashboardData } from '../../mocks/repository';
import { prepareVisualizationData, type PreparedKeyResult } from './visualizationData';

export interface GanttChartWidgetProps {
  data: DashboardData;
}

const weekLabels = ['6月1日', '6月15日', '6月29日', '7月13日', '7月27日', '8月10日', '8月24日', '9月7日'];
const rangeStart = new Date('2026-06-01T00:00:00Z').getTime();
const rangeEnd = new Date('2026-09-14T00:00:00Z').getTime();

function offsetPercent(date: string): number {
  const point = new Date(`${date}T00:00:00Z`).getTime();
  return Math.max(0, Math.min(100, ((point - rangeStart) / (rangeEnd - rangeStart)) * 100));
}

function barStyle(keyResult: PreparedKeyResult, actual: boolean): CSSProperties {
  const left = offsetPercent(keyResult.startDate);
  const fullWidth = Math.max(3, offsetPercent(keyResult.dueDate) - left);
  return {
    left: `${left}%`,
    width: `${actual ? fullWidth * (keyResult.progress / 100) : fullWidth}%`,
  };
}

export function GanttChartWidget({ data }: GanttChartWidgetProps) {
  const { keyResults, milestones, tasks } = prepareVisualizationData(data);

  if (keyResults.length === 0 && milestones.length === 0) {
    return <p className="visualization-empty">当前权限范围内没有可展示的计划。</p>;
  }

  return (
    <div className="gantt-scroll" tabIndex={0} aria-label="项目计划时间轴，可横向滚动">
      <div className="gantt-chart">
        <div className="gantt-chart__legend" aria-label="时间条图例">
          <span><i className="gantt-legend gantt-legend--actual" />实际进度（实心）</span>
          <span><i className="gantt-legend gantt-legend--baseline" />基准计划（计划日期）</span>
          <span><i className="gantt-legend gantt-legend--milestone" />里程碑（菱形）</span>
        </div>
        <details><summary>计算说明</summary><p>虚线基准使用负责人设置的计划日期；实心条仅展示已记录的实际执行进度。</p></details>
        <div className="gantt-chart__weeks" aria-hidden="true">
          {weekLabels.map((week) => <span key={week}>{week}</span>)}
        </div>
        <div className="gantt-chart__rows">
          {keyResults.map((keyResult) => (
            <article className="gantt-row" key={keyResult.id}>
              <div className="gantt-row__label">
                <strong>{keyResult.title}</strong>
                <span>{keyResult.ownerName} · {keyResult.progress}%</span>
              </div>
              <div className="gantt-row__track">
                <span
                  className="gantt-bar gantt-bar--baseline"
                  style={barStyle(keyResult, false)}
                  aria-label={`基准计划：${keyResult.startDate} 至 ${keyResult.dueDate}`}
                />
                <span
                  className="gantt-bar gantt-bar--actual"
                  style={barStyle(keyResult, true)}
                  aria-label={`实际完成 ${keyResult.progress}%`}
                />
              </div>
            </article>
          ))}
          {tasks.map((task) => <article className="gantt-row gantt-row--task" key={task.id}><div className="gantt-row__label"><strong>任务：{task.title}</strong><span>关联 KR：{task.keyResultTitle}</span></div><div className="gantt-row__track"><span className="gantt-bar gantt-bar--baseline" style={{ left: `${offsetPercent(task.startDate)}%`, width: `${Math.max(3, offsetPercent(task.dueDate) - offsetPercent(task.startDate))}%` }} aria-label={`任务计划：${task.startDate} 至 ${task.dueDate}`} /><span className="gantt-bar gantt-bar--actual" style={{ left: `${offsetPercent(task.startDate)}%`, width: `${Math.max(3, offsetPercent(task.dueDate) - offsetPercent(task.startDate)) * task.progress / 100}%` }} aria-label={`任务实际完成 ${task.progress}%`} /></div></article>)}
          {milestones.map((milestone) => (
            <article className="gantt-row gantt-row--milestone" key={milestone.id}>
              <div className="gantt-row__label">
                <strong>{milestone.title}</strong>
                <span>
                  {milestone.dependencyLabels.length > 0
                    ? `依赖：${milestone.dependencyLabels.join('、')}`
                    : '独立检查节点'}
                </span>
              </div>
              <div className="gantt-row__track">
                <span
                  className="gantt-milestone"
                  style={{ left: `${offsetPercent(milestone.dueDate)}%` }}
                  aria-label={`里程碑日期 ${milestone.dueDate}`}
                />
                <StatusBadge status={milestone.status} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
