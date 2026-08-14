import { lazy, Suspense, useEffect, useId, useState } from 'react';
import type { Role } from '../../domain/types';
import { useMediaQuery } from '../../layout/useMediaQuery';
import type { DashboardData } from '../../mocks/repository';
import { WidgetTabs, type WidgetTab } from './WidgetTabs';
import { prepareVisualizationData } from './visualizationData';
import { useLocale, type LocaleContextValue } from '../../i18n/LocaleProvider';

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

function renderResponsivePanel(activeTab: VisualizationId, data: DashboardData, isMobile: boolean, t: LocaleContextValue['t']) {
  const panel = renderPanel(activeTab, data);
  if (!isMobile) return panel;

  const visualizationData = prepareVisualizationData(data);
  const summary = activeTab === 'alignment'
    ? {
        title: t('visualization.alignmentSummary'),
        description: t('visualization.alignmentSummaryDetail', { projects: visualizationData.alignmentProjects.length }),
      }
    : activeTab === 'gantt'
      ? {
          title: t('visualization.ganttSummary'),
          description: t('visualization.ganttSummaryDetail', { krs: visualizationData.keyResults.length, milestones: visualizationData.milestones.length }),
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
        <span className="visualization-mobile-details__affordance">{t('visualization.details')}</span>
      </summary>
      <div className="visualization-mobile-details__content">{panel}</div>
    </details>
  );
}

export interface ProjectVisualizationsWidgetProps {
  data: DashboardData;
}

export function VisualizationLoadingFallback() {
  const { t } = useLocale();
  return <p className="visualization-loading" role="status" aria-live="polite">{t('visualization.loading')}</p>;
}

export function ProjectVisualizationsWidget({ data }: ProjectVisualizationsWidgetProps) {
  const { t } = useLocale();
  const titleId = useId();
  const tabsId = useId();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [activeTab, setActiveTab] = useState<VisualizationId>(() => defaultTab(data.currentUser.role));
  const tabs: readonly WidgetTab<VisualizationId>[] = [
    { id: 'alignment', label: t('visualization.alignment') },
    { id: 'gantt', label: t('visualization.gantt') },
    { id: 'trend', label: t('visualization.trend') },
    { id: 'risk', label: t('visualization.risk') },
    { id: 'workload', label: t('visualization.workload') },
  ];
  const activeDefinition = tabs.find((tab) => tab.id === activeTab)!;

  useEffect(() => {
    setActiveTab(defaultTab(data.currentUser.role));
  }, [data.currentUser.role]);

  return (
    <section className="dashboard-widget dashboard-widget--wide visualization-widget" aria-labelledby={titleId}>
      <div className="dashboard-widget__header visualization-widget__header">
        <div>
          <p className="dashboard-widget__eyebrow">{t('visualization.eyebrow')}</p>
          <h2 id={titleId}>{t('visualization.title')}</h2>
        </div>
        <p className="dashboard-widget__muted">{t('visualization.description')}</p>
      </div>
      <WidgetTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} idBase={tabsId} />
      <div
        id={`${tabsId}-${activeTab}-panel`}
        className="visualization-panel"
        role="tabpanel"
        aria-label={activeDefinition.label}
      >
        <Suspense fallback={<VisualizationLoadingFallback />}>
          {renderResponsivePanel(activeTab, data, isMobile, t)}
        </Suspense>
      </div>
    </section>
  );
}
