import type { CSSProperties } from 'react';
import { StatusBadge } from '../../components/StatusBadge';
import type { DashboardData } from '../../data/types';
import { prepareVisualizationData, type PreparedKeyResult } from './visualizationData';
import { useLocale } from '../../i18n/LocaleProvider';

export interface GanttChartWidgetProps {
  data: DashboardData;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toTimestamp(date: string): number {
  return new Date(`${date}T00:00:00Z`).getTime();
}

function offsetPercent(date: string, rangeStart: number, rangeEnd: number): number {
  if (rangeEnd <= rangeStart) return 0;
  const point = toTimestamp(date);
  return Math.max(0, Math.min(100, ((point - rangeStart) / (rangeEnd - rangeStart)) * 100));
}

function barStyle(keyResult: PreparedKeyResult, actual: boolean, rangeStart: number, rangeEnd: number): CSSProperties {
  const left = offsetPercent(keyResult.startDate, rangeStart, rangeEnd);
  const fullWidth = Math.max(3, offsetPercent(keyResult.dueDate, rangeStart, rangeEnd) - left);
  return {
    left: `${left}%`,
    width: `${actual ? fullWidth * (keyResult.progress / 100) : fullWidth}%`,
  };
}

/** Generate evenly spaced week labels covering [rangeStart, rangeEnd]. */
function weekLabels(rangeStart: number, rangeEnd: number): string[] {
  const days = Math.max(1, Math.round((rangeEnd - rangeStart) / MS_PER_DAY));
  const count = Math.max(1, Math.min(12, Math.ceil(days / 14)));
  const step = (rangeEnd - rangeStart) / count;
  const labels: string[] = [];
  for (let i = 0; i < count; i += 1) {
    labels.push(new Date(rangeStart + step * i).toISOString().slice(0, 10));
  }
  return labels;
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

  // Derive the timeline window from the data instead of a fixed quarter.
  const dates = [
    ...keyResults.flatMap((keyResult) => [keyResult.startDate, keyResult.dueDate]),
    ...tasks.flatMap((task) => [task.startDate, task.dueDate]),
    ...milestones.map((milestone) => milestone.dueDate),
  ].filter(Boolean);
  const rangeStart = dates.length ? Math.min(...dates.map(toTimestamp)) : 0;
  const rangeEnd = dates.length ? Math.max(...dates.map(toTimestamp)) + MS_PER_DAY : MS_PER_DAY;
  const labels = weekLabels(rangeStart, rangeEnd);

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
          {labels.map((week) => <span key={week}>{new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${week}T00:00:00Z`))}</span>)}
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
                  style={barStyle(keyResult, false, rangeStart, rangeEnd)}
                  aria-label={t('gantt.baselineLabel', { start: keyResult.startDate, end: keyResult.dueDate })}
                />
                <span
                  className="gantt-bar gantt-bar--actual"
                  style={barStyle(keyResult, true, rangeStart, rangeEnd)}
                  aria-label={t('gantt.actualLabel', { progress: keyResult.progress })}
                />
              </div>
            </article>
          ))}
          {tasks.map((task) => (
            <article className="gantt-row gantt-row--task" key={task.id}>
              <div className="gantt-row__label"><strong>{t('gantt.task', { title: task.title })}</strong><span>{t('gantt.relatedKr', { title: task.keyResultTitle })}</span></div>
              <div className="gantt-row__track">
                <span
                  className="gantt-bar gantt-bar--baseline"
                  style={{ left: `${offsetPercent(task.startDate, rangeStart, rangeEnd)}%`, width: `${Math.max(3, offsetPercent(task.dueDate, rangeStart, rangeEnd) - offsetPercent(task.startDate, rangeStart, rangeEnd))}%` }}
                  aria-label={t('gantt.taskPlan', { start: task.startDate, end: task.dueDate })}
                />
                <span
                  className="gantt-bar gantt-bar--actual"
                  style={{ left: `${offsetPercent(task.startDate, rangeStart, rangeEnd)}%`, width: `${Math.max(3, offsetPercent(task.dueDate, rangeStart, rangeEnd) - offsetPercent(task.startDate, rangeStart, rangeEnd)) * task.progress / 100}%` }}
                  aria-label={t('gantt.taskActual', { progress: task.progress })}
                />
              </div>
            </article>
          ))}
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
                  style={{ left: `${offsetPercent(milestone.dueDate, rangeStart, rangeEnd)}%` }}
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
