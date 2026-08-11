import { lazy, Suspense, useEffect, useId, useState } from 'react';
import type { Role } from '../../domain/types';
import type { DashboardData } from '../../mocks/repository';
import { WidgetTabs, type WidgetTab } from './WidgetTabs';
import { prepareVisualizationData } from './visualizationData';

const AlignmentTreeWidget = lazy(async () => {
  const module = await import('./AlignmentTreeWidget');
  return { default: module.AlignmentTreeWidget };
});
const GanttChartWidget = lazy(async () => {
  const module = await import('./GanttChartWidget');
  return { default: module.GanttChartWidget };
});
const ProgressTrendWidget = lazy(async () => {
  const module = await import('./ProgressTrendWidget');
  return { default: module.ProgressTrendWidget };
});
const RiskMatrixWidget = lazy(async () => {
  const module = await import('./RiskMatrixWidget');
  return { default: module.RiskMatrixWidget };
});
const WorkloadWidget = lazy(async () => {
  const module = await import('./WorkloadWidget');
  return { default: module.WorkloadWidget };
});

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

function renderResponsivePanel(activeTab: VisualizationId, data: DashboardData) {
  const panel = renderPanel(activeTab, data);
  const visualizationData = prepareVisualizationData(data);
  const summary = activeTab === 'alignment'
    ? {
        title: 'OKR 对齐摘要',
        description: `已整理 ${visualizationData.alignmentProjects.length} 个授权项目的 Objective 与 KR 关系。`,
      }
    : activeTab === 'gantt'
      ? {
          title: '项目计划摘要',
          description: `已纳入 ${visualizationData.keyResults.length} 个 KR 和 ${visualizationData.milestones.length} 个里程碑。`,
        }
      : undefined;

  if (!summary) return panel;

  return (
    <details className="visualization-mobile-details">
      <summary>
        <span>
          <strong>{summary.title}</strong>
          <span>{summary.description}</span>
        </span>
        <span className="visualization-mobile-details__affordance">查看详情</span>
      </summary>
      <div className="visualization-mobile-details__content">{panel}</div>
    </details>
  );
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
        <Suspense fallback={<p className="visualization-loading" role="status" aria-live="polite">正在加载项目视图</p>}>
          {renderResponsivePanel(activeTab, data)}
        </Suspense>
      </div>
    </section>
  );
}
