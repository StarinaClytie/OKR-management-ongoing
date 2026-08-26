import { Fragment, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { roleLabels } from '../../auth/roleLabels';
import { MetricCard } from '../../components/MetricCard';
import { PageHeader } from '../../components/PageHeader';
import type { HrWorkHourRow, OkrRepository } from '../../data/types';
import { applyHrHourFilters, currentWeekRange, hrHourStats, weeklySummaries, WEEK_DAYS } from '../../domain/hrWorkHours';
import type { Role } from '../../domain/types';
import { useLocale } from '../../i18n/LocaleProvider';
import type { MessageKey } from '../../i18n/messages';
import { repository } from '../../lib/supabase';

type View = 'daily' | 'weekly';

const dayKey: Record<(typeof WEEK_DAYS)[number], MessageKey> = {
  Mon: 'hrHours.day.mon',
  Tue: 'hrHours.day.tue',
  Wed: 'hrHours.day.wed',
  Thu: 'hrHours.day.thu',
  Fri: 'hrHours.day.fri',
  Sat: 'hrHours.day.sat',
  Sun: 'hrHours.day.sun',
};

interface HrHourFilterState {
  memberId?: string;
  role?: Role;
  projectLeaderId?: string;
  projectId?: string;
  objectiveId?: string;
  krId?: string;
}

function uniqueOptions(
  rows: readonly HrWorkHourRow[],
  idOf: (row: HrWorkHourRow) => string | null,
  labelOf: (row: HrWorkHourRow) => string,
): Array<{ id: string; label: string }> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const id = idOf(row);
    if (id && !map.has(id)) map.set(id, labelOf(row));
  }
  return [...map.entries()].map(([id, label]) => ({ id, label }));
}

export function HrWorkHoursPage({ dataRepository = repository }: { dataRepository?: OkrRepository }) {
  const { t } = useLocale();
  const { currentUser } = useAuth();
  const defaultWeek = useMemo(() => currentWeekRange(), []);
  const [fromDate, setFromDate] = useState(defaultWeek.from);
  const [toDate, setToDate] = useState(defaultWeek.to);
  const [rows, setRows] = useState<HrWorkHourRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('daily');
  const [filters, setFilters] = useState<HrHourFilterState>({});
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    setLoading(true);
    void dataRepository.getHrWorkHours({ from: fromDate, to: toDate }).then((result) => {
      if (cancelled) return;
      setRows(result.ok ? result.data : []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [currentUser, dataRepository, fromDate, toDate]);

  const objectiveLabel = (row: HrWorkHourRow) => (row.objectiveArchived || !row.objectiveTitle ? t('hrHours.archivedObjective') : row.objectiveTitle);
  const krLabel = (row: HrWorkHourRow) => (row.krTitle ?? t('hrHours.archivedKr'));

  const filtered = useMemo(
    () => applyHrHourFilters(rows, { fromDate, toDate, ...filters }),
    [rows, fromDate, toDate, filters],
  );
  const stats = useMemo(() => hrHourStats(filtered), [filtered]);
  const summaries = useMemo(() => weeklySummaries(filtered), [filtered]);

  const memberOptions = uniqueOptions(rows, (row) => row.userId, (row) => row.displayName);
  const roleOptions = [...new Set(rows.map((row) => row.role).filter((role): role is Role => role !== null))];
  const leaderOptions = uniqueOptions(rows, (row) => row.projectLeaderId, (row) => row.projectLeaderName ?? '—');
  const projectOptions = uniqueOptions(rows, (row) => row.projectId, (row) => row.projectName ?? '—');
  const objectiveOptions = uniqueOptions(rows, (row) => row.objectiveId, objectiveLabel);
  const krOptions = uniqueOptions(
    rows.filter((row) => !filters.objectiveId || row.objectiveId === filters.objectiveId),
    (row) => row.krId,
    krLabel,
  );

  const setFilter = <K extends keyof HrHourFilterState>(key: K, value: HrHourFilterState[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const toggleExpanded = (userId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  if (!currentUser) return null;

  return (
    <section className="business-page" aria-labelledby="hr-hours-title">
      <PageHeader title={t('hrHours.title')} description={t('hrHours.description')} />

      <div className="dashboard-metrics">
        <MetricCard label={t('hrHours.totalHours')} value={t('common.hours', { count: stats.totalHours })} />
        <MetricCard label={t('hrHours.memberCount')} value={stats.memberCount} />
        <MetricCard label={t('hrHours.krCount')} value={stats.krCount} />
      </div>

      <div className="filter-row">
        <label className="modal-field">
          <span>{t('hrHours.from')}</span>
          <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
        </label>
        <label className="modal-field">
          <span>{t('hrHours.to')}</span>
          <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        </label>
        <label className="modal-field">
          <span>{t('hrHours.member')}</span>
          <select value={filters.memberId ?? ''} onChange={(event) => setFilter('memberId', event.target.value || undefined)}>
            <option value="">{t('hrHours.all')}</option>
            {memberOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <label className="modal-field">
          <span>{t('hrHours.role')}</span>
          <select value={filters.role ?? ''} onChange={(event) => setFilter('role', (event.target.value || undefined) as Role | undefined)}>
            <option value="">{t('hrHours.all')}</option>
            {roleOptions.map((role) => <option key={role} value={role}>{t(roleLabels[role])}</option>)}
          </select>
        </label>
        <label className="modal-field">
          <span>{t('hrHours.projectLeader')}</span>
          <select value={filters.projectLeaderId ?? ''} onChange={(event) => setFilter('projectLeaderId', event.target.value || undefined)}>
            <option value="">{t('hrHours.all')}</option>
            {leaderOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <label className="modal-field">
          <span>{t('hrHours.project')}</span>
          <select value={filters.projectId ?? ''} onChange={(event) => setFilter('projectId', event.target.value || undefined)}>
            <option value="">{t('hrHours.all')}</option>
            {projectOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <label className="modal-field">
          <span>{t('hrHours.objective')}</span>
          <select
            value={filters.objectiveId ?? ''}
            onChange={(event) => setFilters((current) => ({ ...current, objectiveId: event.target.value || undefined, krId: undefined }))}
          >
            <option value="">{t('hrHours.all')}</option>
            {objectiveOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <label className="modal-field">
          <span>{t('hrHours.kr')}</span>
          <select value={filters.krId ?? ''} onChange={(event) => setFilter('krId', event.target.value || undefined)}>
            <option value="">{t('hrHours.all')}</option>
            {krOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
      </div>

      <div className="filter-row" role="tablist" aria-label={t('hrHours.title')}>
        <button type="button" role="tab" aria-selected={view === 'daily'} className={`reports-tab${view === 'daily' ? ' reports-tab--active' : ''}`} onClick={() => setView('daily')}>{t('hrHours.dailyView')}</button>
        <button type="button" role="tab" aria-selected={view === 'weekly'} className={`reports-tab${view === 'weekly' ? ' reports-tab--active' : ''}`} onClick={() => setView('weekly')}>{t('hrHours.weeklyView')}</button>
      </div>

      {loading ? <p className="data-table__empty" role="status">{t('common.loading')}</p> : null}

      {!loading && rows.length === 0 ? <p className="data-table__empty">{t('hrHours.empty')}</p> : null}

      {!loading && rows.length > 0 && filtered.length === 0 ? <p className="data-table__empty">{t('hrHours.emptyFiltered')}</p> : null}

      {!loading && filtered.length > 0 && view === 'daily' ? (
        <div className="table-scroll" style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('hrHours.date')}</th>
                <th>{t('hrHours.member')}</th>
                <th>{t('hrHours.role')}</th>
                <th>{t('hrHours.projectLeader')}</th>
                <th>{t('hrHours.project')}</th>
                <th>{t('hrHours.objective')}</th>
                <th>{t('hrHours.kr')}</th>
                <th>{t('hrHours.hours')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, index) => (
                <tr key={`${row.date}-${row.userId}-${row.krId ?? 'none'}-${index}`}>
                  <td>{row.date}</td>
                  <td>{row.displayName}</td>
                  <td>{row.role ? t(roleLabels[row.role]) : '—'}</td>
                  <td>{row.projectLeaderName ?? '—'}</td>
                  <td>{row.projectName ?? '—'}</td>
                  <td>{objectiveLabel(row)}</td>
                  <td>{krLabel(row)}</td>
                  <td>{t('common.hours', { count: row.hours })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && filtered.length > 0 && view === 'weekly' ? (
        <div className="table-scroll" style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('hrHours.member')}</th>
                <th>{t('hrHours.role')}</th>
                {WEEK_DAYS.map((day) => <th key={day}>{t(dayKey[day])}</th>)}
                <th>{t('hrHours.total')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {summaries.map((summary) => (
                <Fragment key={summary.userId}>
                  <tr>
                    <td>{summary.displayName}</td>
                    <td>{summary.role ? t(roleLabels[summary.role]) : '—'}</td>
                    {WEEK_DAYS.map((day) => <td key={day}>{summary.daily[day] ?? 0}</td>)}
                    <td>{summary.total}</td>
                    <td>
                      <button type="button" className="text-button" aria-expanded={expanded.has(summary.userId)} onClick={() => toggleExpanded(summary.userId)}>
                        {expanded.has(summary.userId) ? t('hrHours.collapse') : t('hrHours.expand')}
                      </button>
                    </td>
                  </tr>
                  {expanded.has(summary.userId) ? (
                    <tr>
                      <td colSpan={10}>
                        <ul className="member-list">
                          {summary.breakdown.map((row, index) => (
                            <li key={`${row.date}-${row.krId ?? 'none'}-${index}`} className="member-list__row">
                              <div className="member-list__identity">
                                <span className="member-list__name">{row.date} · {row.projectName ?? '—'}</span>
                                <span className="member-list__meta">{objectiveLabel(row)} · {krLabel(row)}</span>
                              </div>
                              <div className="member-list__meta">{t('common.hours', { count: row.hours })}</div>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
