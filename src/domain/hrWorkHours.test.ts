import { describe, expect, it } from 'vitest';
import type { HrWorkHourRow } from '../data/types';
import { applyHrHourFilters, currentWeekRange, dayOfWeekLabel, hrHourStats, weeklySummaries } from './hrWorkHours';

function row(overrides: Partial<HrWorkHourRow> = {}): HrWorkHourRow {
  return {
    date: '2026-08-24',
    userId: 'u1',
    displayName: '张三',
    role: 'employee',
    projectLeaderName: '李然',
    projectLeaderId: 'leader1',
    projectId: 'p1',
    projectName: '光谱仪',
    objectiveId: 'o1',
    objectiveTitle: '下一代光谱仪',
    objectiveArchived: false,
    krId: 'kr1',
    krTitle: '光路设计',
    hours: 3,
    ...overrides,
  };
}

describe('dayOfWeekLabel', () => {
  it('maps an ISO date to the Monday-first weekday label', () => {
    expect(dayOfWeekLabel('2026-08-24')).toBe('Mon'); // 2026-08-24 is a Monday
    expect(dayOfWeekLabel('2026-08-30')).toBe('Sun');
  });
});

describe('currentWeekRange', () => {
  it('returns a Monday-to-Sunday range containing the given date', () => {
    const range = currentWeekRange(new Date('2026-08-25T12:00:00Z'));
    expect(range.from).toBe('2026-08-24');
    expect(range.to).toBe('2026-08-30');
  });
});

describe('applyHrHourFilters', () => {
  const rows = [
    row({ userId: 'u1', role: 'employee', projectId: 'p1', objectiveId: 'o1', krId: 'kr1' }),
    row({ userId: 'u2', role: 'hr', projectId: 'p2', objectiveId: 'o2', krId: 'kr2', projectLeaderId: 'leader2', date: '2026-08-25' }),
  ];

  it('filters by objective and cascades to no rows for an unrelated KR', () => {
    const filtered = applyHrHourFilters(rows, { fromDate: '2026-08-24', toDate: '2026-08-30', objectiveId: 'o1' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].krId).toBe('kr1');
  });

  it('filters by role', () => {
    expect(applyHrHourFilters(rows, { fromDate: '2026-08-24', toDate: '2026-08-30', role: 'hr' })).toHaveLength(1);
  });

  it('filters by project leader', () => {
    expect(applyHrHourFilters(rows, { fromDate: '2026-08-24', toDate: '2026-08-30', projectLeaderId: 'leader1' })).toHaveLength(1);
  });
});

describe('hrHourStats', () => {
  it('totals hours and counts distinct members and KRs', () => {
    const stats = hrHourStats([
      row({ userId: 'u1', krId: 'kr1', hours: 3 }),
      row({ userId: 'u1', krId: 'kr2', hours: 2 }),
      row({ userId: 'u2', krId: 'kr1', hours: 1 }),
    ]);
    expect(stats.totalHours).toBe(6);
    expect(stats.memberCount).toBe(2);
    expect(stats.krCount).toBe(2);
  });
});

describe('weeklySummaries', () => {
  it('aggregates per-employee daily totals across the week', () => {
    const summaries = weeklySummaries([
      row({ userId: 'u1', date: '2026-08-24', krId: 'kr1', hours: 3 }),
      row({ userId: 'u1', date: '2026-08-24', krId: 'kr2', hours: 2 }),
      row({ userId: 'u1', date: '2026-08-25', krId: 'kr1', hours: 1 }),
      row({ userId: 'u2', date: '2026-08-24', krId: 'kr1', hours: 4 }),
    ]);
    expect(summaries).toHaveLength(2);
    const alice = summaries.find((summary) => summary.userId === 'u1')!;
    expect(alice.daily.Mon).toBe(5);
    expect(alice.daily.Tue).toBe(1);
    expect(alice.total).toBe(6);
  });
});
