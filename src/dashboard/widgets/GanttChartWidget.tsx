import type { CSSProperties } from 'react';
import { StatusBadge } from '../../components/StatusBadge';
import type { DashboardData } from '../../mocks/repository';
import { prepareVisualizationData, type PreparedKeyResult } from './visualizationData';
import { useLocale } from '../../i18n/LocaleProvider';

export interface GanttChartWidgetProps {
  data: DashboardData;
}

const weekDates = ['2026-06-01', '2026-06-15', '2026-06-29', '2026-07-13', '2026-07-27', '2026-08-10', '2026-08-24', '2026-09-07'];
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
  const { locale, t } = useLocale();
  const { keyResults, milestones, tasks } = prepareVisualizationData(data, {
    unknownMember: t('table.member'),
    authorizedKeyResult: t('gantt.authorizedKr'),
  });

  if (keyResults.length === 0 && milestones.length === 0) {
    return <p className="visualization-empty">{t('gantt.empty')}</p>;
  }

  return (
    <div className="gantt-scroll" tabIndex={0} aria-label={t('gantt.timeline')}>
      <div className="gantt-chart">
        <div className="gantt-chart__legend" aria-label={t('gantt.legend')}>
          <span><i className="gantt-legend gantt-legend--actual" />{t('gantt.actual')}</span>
          <span><i className="gantt-legend gantt-legend--baseline" />{t('gantt.baseline')}</span>
          <span><i className="gantt-legend gantt-legend--milestone" />{t('gantt.milestone')}</span>
        </div>
        <details><summary>{t('gantt.calculation')}</summary><p>{t('gantt.calculationDetail')}</p></details>
        <div className="gantt-chart__weeks" aria-hidden="true">
          {weekDates.map((week) => <span key={week}>{new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${week}T00:00:00Z`))}</span>)}
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
                  aria-label={t('gantt.baselineLabel', { start: keyResult.startDate, end: keyResult.dueDate })}
                />
                <span
                  className="gantt-bar gantt-bar--actual"
                  style={barStyle(keyResult, true)}
                  aria-label={t('gantt.actualLabel', { progress: keyResult.progress })}
                />
              </div>
            </article>
          ))}
          {tasks.map((task) => <article className="gantt-row gantt-row--task" key={task.id}><div className="gantt-row__label"><strong>{t('gantt.task', { title: task.title })}</strong><span>{t('gantt.relatedKr', { title: task.keyResultTitle })}</span></div><div className="gantt-row__track"><span className="gantt-bar gantt-bar--baseline" style={{ left: `${offsetPercent(task.startDate)}%`, width: `${Math.max(3, offsetPercent(task.dueDate) - offsetPercent(task.startDate))}%` }} aria-label={t('gantt.taskPlan', { start: task.startDate, end: task.dueDate })} /><span className="gantt-bar gantt-bar--actual" style={{ left: `${offsetPercent(task.startDate)}%`, width: `${Math.max(3, offsetPercent(task.dueDate) - offsetPercent(task.startDate)) * task.progress / 100}%` }} aria-label={t('gantt.taskActual', { progress: task.progress })} /></div></article>)}
          {milestones.map((milestone) => (
            <article className="gantt-row gantt-row--milestone" key={milestone.id}>
              <div className="gantt-row__label">
                <strong>{milestone.title}</strong>
                <span>
                  {milestone.dependencyLabels.length > 0
                    ? t('gantt.dependencies', { items: milestone.dependencyLabels.join(locale === 'zh-CN' ? '、' : ', ') })
                    : t('gantt.independent')}
                </span>
              </div>
              <div className="gantt-row__track">
                <span
                  className="gantt-milestone"
                  style={{ left: `${offsetPercent(milestone.dueDate)}%` }}
                  aria-label={t('gantt.milestoneDate', { date: milestone.dueDate })}
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
