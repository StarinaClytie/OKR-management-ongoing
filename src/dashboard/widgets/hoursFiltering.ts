import type { DashboardData } from '../../data/types';

/** One actual recorded-hour entry (a Daily OKR block, or a legacy report total). */
export interface HourEntry {
  userId: string;
  date: string;
  projectId: string;
  objectiveId: string;
  keyResultId: string;
  quarter: string;
  hours: number;
}

export interface HourFilters {
  fromDate?: string;
  toDate?: string;
  employeeId?: string;
  projectId?: string;
  objectiveId?: string;
  keyResultId?: string;
  quarter?: string;
}

export interface HourBreakdownItem {
  objectiveId: string;
  keyResultId: string;
  hours: number;
}

export interface EmployeeHours {
  userId: string;
  total: number;
  breakdown: HourBreakdownItem[];
}

/**
 * Build authorized hour entries from the DashboardData. In Supabase mode the
 * repository already returns only RLS-visible rows; the role scoping here is a
 * deterministic client-side mirror of that RLS so demo mode stays consistent and
 * no unauthorized row is ever surfaced.
 */
export function buildHourEntries(data: DashboardData): HourEntry[] {
  const currentUser = data.currentUser;
  const role = currentUser.role;
  const objectiveById = new Map(data.objectives.map((objective) => [objective.id, objective]));
  const keyResultById = new Map(data.keyResults.map((keyResult) => [keyResult.id, keyResult]));
  const entries: HourEntry[] = [];

  if (role === 'hr') {
    for (const workload of data.workloads) {
      entries.push({
        userId: workload.userId,
        date: workload.periodStart,
        projectId: '',
        objectiveId: '',
        keyResultId: '',
        quarter: '',
        hours: workload.loggedHours,
      });
    }
    return entries;
  }

  const ledProjectIds = new Set(
    data.projects.filter((project) => project.leaderId === currentUser.id).map((project) => project.id),
  );

  for (const report of data.dailyReports) {
    const isOwnReport = report.authorId === currentUser.id;
    if (role === 'employee' && !isOwnReport) continue;

    const blocks = report.blocks ?? [];

    if (blocks.length > 0) {
      for (const block of blocks) {
        const keyResult = keyResultById.get(block.keyResultId);
        const objective = keyResult ? objectiveById.get(keyResult.objectiveId) : undefined;
        const projectId = block.projectId ?? objective?.projectId ?? '';
        if (role === 'project_leader' && !isOwnReport && (!projectId || !ledProjectIds.has(projectId))) continue;
        entries.push({
          userId: report.authorId,
          date: report.date,
          projectId,
          objectiveId: keyResult?.objectiveId ?? '',
          keyResultId: block.keyResultId,
          quarter: objective?.quarter ?? '',
          hours: block.hours,
        });
      }
    } else {
      const objective = objectiveById.get(report.objectiveId);
      const projectId = objective?.projectId ?? report.projectId;
      if (role === 'project_leader' && !isOwnReport && (!projectId || !ledProjectIds.has(projectId))) continue;
      entries.push({
        userId: report.authorId,
        date: report.date,
        projectId,
        objectiveId: report.objectiveId,
        keyResultId: report.keyResultIds[0] ?? '',
        quarter: objective?.quarter ?? '',
        hours: report.hours,
      });
    }
  }

  return entries;
}

/** Apply the filter set to an entry list. Empty filter fields mean "all". */
export function applyHourFilters(entries: readonly HourEntry[], filters: HourFilters): HourEntry[] {
  return entries.filter((entry) => {
    if (filters.fromDate && entry.date < filters.fromDate) return false;
    if (filters.toDate && entry.date > filters.toDate) return false;
    if (filters.employeeId && entry.userId !== filters.employeeId) return false;
    if (filters.projectId && entry.projectId !== filters.projectId) return false;
    if (filters.objectiveId && entry.objectiveId !== filters.objectiveId) return false;
    if (filters.keyResultId && entry.keyResultId !== filters.keyResultId) return false;
    if (filters.quarter && entry.quarter !== filters.quarter) return false;
    return true;
  });
}

/** Aggregate filtered entries into per-employee totals with an O/KR breakdown. */
export function aggregateHourEntries(entries: readonly HourEntry[]): EmployeeHours[] {
  const byEmployee = new Map<string, EmployeeHours>();
  for (const entry of entries) {
    const existing = byEmployee.get(entry.userId) ?? { userId: entry.userId, total: 0, breakdown: [] };
    existing.total += entry.hours;
    const item = existing.breakdown.find(
      (candidate) => candidate.objectiveId === entry.objectiveId && candidate.keyResultId === entry.keyResultId,
    );
    if (item) item.hours += entry.hours;
    else existing.breakdown.push({ objectiveId: entry.objectiveId, keyResultId: entry.keyResultId, hours: entry.hours });
    byEmployee.set(entry.userId, existing);
  }
  return [...byEmployee.values()].sort((left, right) => right.total - left.total);
}

/** Convenience: build authorized entries then aggregate them. */
export function aggregateRecordedHours(data: DashboardData): EmployeeHours[] {
  return aggregateHourEntries(buildHourEntries(data));
}
