import { useMemo, useState } from 'react';
import type { DashboardData } from '../../data/types';
import { useLocale } from '../../i18n/LocaleProvider';
import {
  aggregateHourEntries,
  applyHourFilters,
  buildHourEntries,
  type HourFilters,
} from './hoursFiltering';

export interface HoursWidgetProps {
  data: DashboardData;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

export function HoursWidget({ data }: HoursWidgetProps) {
  const { t } = useLocale();
  const entries = useMemo(() => buildHourEntries(data), [data]);
  const [filters, setFilters] = useState<HourFilters>({});

  const employeeOptions = useMemo(() => {
    const ids = unique(entries.map((entry) => entry.userId));
    return ids.map((id) => ({ id, name: data.users.find((user) => user.id === id)?.name ?? t('table.member') }));
  }, [entries, data.users, t]);

  const projectOptions = useMemo(() => {
    const ids = unique(entries.map((entry) => entry.projectId));
    return ids.map((id) => ({ id, name: data.projects.find((project) => project.id === id)?.name ?? id }));
  }, [entries, data.projects]);

  const objectiveIds = useMemo(() => {
    const scoped = filters.projectId ? entries.filter((entry) => entry.projectId === filters.projectId) : entries;
    return unique(scoped.map((entry) => entry.objectiveId));
  }, [entries, filters.projectId]);

  const keyResultIds = useMemo(() => {
    let scoped = filters.projectId ? entries.filter((entry) => entry.projectId === filters.projectId) : entries;
    if (filters.objectiveId) scoped = scoped.filter((entry) => entry.objectiveId === filters.objectiveId);
    return unique(scoped.map((entry) => entry.keyResultId));
  }, [entries, filters.projectId, filters.objectiveId]);

  const quarterOptions = useMemo(() => unique(entries.map((entry) => entry.quarter)), [entries]);

  const filteredEntries = useMemo(() => applyHourFilters(entries, filters), [entries, filters]);
  const employees = useMemo(() => aggregateHourEntries(filteredEntries), [filteredEntries]);
  const totalHours = filteredEntries.reduce((sum, entry) => sum + entry.hours, 0);

  const setFilter = (patch: Partial<HourFilters>) => setFilters((current) => ({ ...current, ...patch }));

  const changeProject = (projectId: string) => {
    const next: HourFilters = { ...filters, projectId: projectId || undefined };
    const scoped = projectId ? entries.filter((entry) => entry.projectId === projectId) : entries;
    const validObjectiveIds = new Set(scoped.map((entry) => entry.objectiveId));
    if (next.objectiveId && !validObjectiveIds.has(next.objectiveId)) {
      next.objectiveId = undefined;
      next.keyResultId = undefined;
    }
    setFilters(next);
  };

  const changeObjective = (objectiveId: string) => {
    const next: HourFilters = { ...filters, objectiveId: objectiveId || undefined };
    let scoped = filters.projectId ? entries.filter((entry) => entry.projectId === filters.projectId) : entries;
    if (objectiveId) scoped = scoped.filter((entry) => entry.objectiveId === objectiveId);
    const validKrIds = new Set(scoped.map((entry) => entry.keyResultId));
    if (next.keyResultId && !validKrIds.has(next.keyResultId)) next.keyResultId = undefined;
    setFilters(next);
  };

  const reset = () => setFilters({});

  const objectiveById = new Map(data.objectives.map((objective) => [objective.id, objective]));
  const keyResultById = new Map(data.keyResults.map((keyResult) => [keyResult.id, keyResult]));

  return (
    <div className="hours-visualization">
      <div className="hours-filterbar" role="group" aria-label={t('hours.filters')}>
        <label>
          <span>{t('hours.from')}</span>
          <input type="date" value={filters.fromDate ?? ''} onChange={(event) => setFilter({ fromDate: event.target.value || undefined })} />
        </label>
        <label>
          <span>{t('hours.to')}</span>
          <input type="date" value={filters.toDate ?? ''} onChange={(event) => setFilter({ toDate: event.target.value || undefined })} />
        </label>
        <label>
          <span>{t('hours.employee')}</span>
          <select value={filters.employeeId ?? ''} onChange={(event) => setFilter({ employeeId: event.target.value || undefined })}>
            <option value="">{t('okr.all')}</option>
            {employeeOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </label>
        <label>
          <span>{t('hours.project')}</span>
          <select value={filters.projectId ?? ''} onChange={(event) => changeProject(event.target.value)}>
            <option value="">{t('okr.all')}</option>
            {projectOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </label>
        <label>
          <span>{t('hours.objective')}</span>
          <select value={filters.objectiveId ?? ''} onChange={(event) => changeObjective(event.target.value)}>
            <option value="">{t('okr.all')}</option>
            {objectiveIds.map((id) => <option key={id} value={id}>{objectiveById.get(id)?.title ?? id}</option>)}
          </select>
        </label>
        <label>
          <span>{t('hours.kr')}</span>
          <select value={filters.keyResultId ?? ''} onChange={(event) => setFilter({ keyResultId: event.target.value || undefined })}>
            <option value="">{t('okr.all')}</option>
            {keyResultIds.map((id) => <option key={id} value={id}>{keyResultById.get(id)?.title ?? id}</option>)}
          </select>
        </label>
        <label>
          <span>{t('hours.quarter')}</span>
          <select value={filters.quarter ?? ''} onChange={(event) => setFilter({ quarter: event.target.value || undefined })}>
            <option value="">{t('okr.all')}</option>
            {quarterOptions.map((quarter) => <option key={quarter} value={quarter}>{quarter}</option>)}
          </select>
        </label>
        <button type="button" className="button button--secondary" onClick={reset}>{t('hours.reset')}</button>
      </div>

      <p className="hours-summary">{t('hours.summary', { hours: totalHours, employees: employees.length, records: filteredEntries.length })}</p>

      {employees.length === 0 ? (
        <p className="visualization-empty">{t('hours.emptyFiltered')}</p>
      ) : (
        employees.map((employee) => {
          const member = data.users.find((user) => user.id === employee.userId);
          return (
            <article className="hours-card" key={employee.userId}>
              <div className="hours-card__heading">
                <strong>{member?.name ?? t('table.member')}</strong>
                <span>{t('common.hours', { count: employee.total })}</span>
              </div>
              <dl>
                {employee.breakdown.map((item, index) => {
                  const objective = objectiveById.get(item.objectiveId);
                  const keyResult = keyResultById.get(item.keyResultId);
                  const label = [objective?.title, keyResult?.title].filter(Boolean).join(' / ') || t('daily.unknownMember');
                  return (
                    <div key={`${item.objectiveId}-${item.keyResultId}-${index}`}>
                      <dt>{label}</dt>
                      <dd>{t('common.hours', { count: item.hours })}</dd>
                    </div>
                  );
                })}
              </dl>
            </article>
          );
        })
      )}
    </div>
  );
}
