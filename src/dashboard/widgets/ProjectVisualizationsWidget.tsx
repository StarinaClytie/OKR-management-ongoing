import { useEffect, useId, useState } from 'react';
import type { Role } from '../../domain/types';
import type { DashboardData } from '../../mocks/repository';
import { AlignmentTreeWidget } from './AlignmentTreeWidget';
import { GanttChartWidget } from './GanttChartWidget';
import { ProgressTrendWidget } from './ProgressTrendWidget';
import { RiskMatrixWidget } from './RiskMatrixWidget';
import { WidgetTabs, type WidgetTab } from './WidgetTabs';
import { WorkloadWidget } from './WorkloadWidget';

type VisualizationId = 'alignment' | 'gantt' | 'trend' | 'risk' | 'workload';

const tabs: readonly WidgetTab<VisualizationId>[] = [
  { id: 'alignment', label: '对齐树' },
  { id: 'gantt', label: '甘特图' },
  { id: 'trend', label: '进度趋势' },
  { id: 'risk', label: '风险矩阵' },
  { id: 'workload', label: '工作负载' },
];

function defaultTab(role: Role): VisualizationId {
  if (role === 'employee') return 'trend';
  if (role === 'hr') return 'workload';
  return 'alignment';
}

function renderPanel(activeTab: VisualizationId, data: DashboardData) {
  switch (activeTab) {
    case 'alignment': return <AlignmentTreeWidget data={data} />;
    case 'gantt': return <GanttChartWidget data={data} />;
    case 'trend': return <ProgressTrendWidget data={data} />;
    case 'risk': return <RiskMatrixWidget data={data} />;
    case 'workload': return <WorkloadWidget data={data} />;
  }
}

export interface ProjectVisualizationsWidgetProps {
  data: DashboardData;
}

export function ProjectVisualizationsWidget({ data }: ProjectVisualizationsWidgetProps) {
  const titleId = useId();
  const tabsId = useId();
  const [activeTab, setActiveTab] = useState<VisualizationId>(() => defaultTab(data.currentUser.role));
  const activeDefinition = tabs.find((tab) => tab.id === activeTab)!;

  useEffect(() => {
    setActiveTab(defaultTab(data.currentUser.role));
  }, [data.currentUser.role]);

  return (
    <section className="dashboard-widget dashboard-widget--wide visualization-widget" aria-labelledby={titleId}>
      <div className="dashboard-widget__header visualization-widget__header">
        <div>
          <p className="dashboard-widget__eyebrow">按需查看</p>
          <h2 id={titleId}>项目专业视图</h2>
        </div>
        <p className="dashboard-widget__muted">一次只显示一种视图，选择标签即可切换。</p>
      </div>
      <WidgetTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} idBase={tabsId} />
      <div
        id={`${tabsId}-${activeTab}-panel`}
        className="visualization-panel"
        role="tabpanel"
        aria-label={activeDefinition.label}
      >
        {renderPanel(activeTab, data)}
      </div>
    </section>
  );
}
