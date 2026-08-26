import type { HrWorkHourRow } from '../data/types';
import type { Role } from './types';

/** Monday-first day-of-week labels used by the weekly summary. */
export const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export interface HrHourFilters {
  fromDate: string;
  toDate: string;
  memberId?: string;
  role?: Role;
  projectLeaderId?: string;
  projectId?: string;
  objectiveId?: string;
  krId?: string;
}

function shanghaiParts(now: Date): { year: number; month: number; day: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekdayName = parts.find((part) => part.type === 'weekday')?.value ?? 'Mon';
  return { year: value('year'), month: value('month'), day: value('day'), weekday: weekdayMap[weekdayName] };
}

function toDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Monday-based current week in Asia/Shanghai. */
export function currentWeekRange(now = new Date()): { from: string; to: string } {
  const { year, month, day, weekday } = shanghaiParts(now);
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const monday = new Date(Date.UTC(year, month - 1, day + mondayOffset));
  const sunday = new Date(monday.getTime() + 6 * 86400000);
  const fmt = (d: Date) => toDateString(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  return { from: fmt(monday), to: fmt(sunday) };
}

export function applyHrHourFilters(rows: readonly HrWorkHourRow[], filters: HrHourFilters): HrWorkHourRow[] {
  return rows.filter((row) => {
    if (row.date < filters.fromDate || row.date > filters.toDate) return false;
    if (filters.memberId && row.userId !== filters.memberId) return false;
    if (filters.role && row.role !== filters.role) return false;
    if (filters.projectLeaderId && row.projectLeaderId !== filters.projectLeaderId) return false;
    if (filters.projectId && row.projectId !== filters.projectId) return false;
    if (filters.objectiveId && row.objectiveId !== filters.objectiveId) return false;
    if (filters.krId && row.krId !== filters.krId) return false;
    return true;
  });
}

export interface HrHourStats {
  totalHours: number;
  memberCount: number;
  krCount: number;
}

export function hrHourStats(rows: readonly HrWorkHourRow[]): HrHourStats {
  return {
    totalHours: rows.reduce((sum, row) => sum + (Number.isFinite(row.hours) ? row.hours : 0), 0),
    memberCount: new Set(rows.map((row) => row.userId)).size,
    krCount: new Set(rows.filter((row) => row.krId).map((row) => row.krId as string)).size,
  };
}

/** `2026-08-25` → `'Mon'` (date parsed as UTC to avoid host-timezone drift). */
export function dayOfWeekLabel(dateStr: string): (typeof WEEK_DAYS)[number] {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const labels: Record<number, (typeof WEEK_DAYS)[number]> = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };
  return labels[date.getUTCDay()];
}

export interface WeeklyEmployeeSummary {
  userId: string;
  displayName: string;
  role: Role | null;
  projectLeaderName: string | null;
  daily: Partial<Record<(typeof WEEK_DAYS)[number], number>>;
  total: number;
  breakdown: HrWorkHourRow[];
}

export function weeklySummaries(rows: readonly HrWorkHourRow[]): WeeklyEmployeeSummary[] {
  const byUser = new Map<string, HrWorkHourRow[]>();
  for (const row of rows) {
    const list = byUser.get(row.userId) ?? [];
    list.push(row);
    byUser.set(row.userId, list);
  }
  return [...byUser.entries()]
    .map(([userId, userRows]) => {
      const daily: WeeklyEmployeeSummary['daily'] = {};
      for (const row of userRows) {
        const day = dayOfWeekLabel(row.date);
        daily[day] = (daily[day] ?? 0) + (Number.isFinite(row.hours) ? row.hours : 0);
      }
      const first = userRows[0];
      return {
        userId,
        displayName: first.displayName,
        role: first.role,
        projectLeaderName: first.projectLeaderName,
        daily,
        total: userRows.reduce((sum, row) => sum + (Number.isFinite(row.hours) ? row.hours : 0), 0),
        breakdown: userRows,
      };
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}
