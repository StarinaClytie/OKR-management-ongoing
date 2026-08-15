import { describe, expect, it } from 'vitest';
import { plannedProgressAt, validateProgressPlan } from './progressPlan';

const kr = { startDate: '2026-08-01', dueDate: '2026-08-31', measurementType: 'percentage' as const, targetValue: 100 };

describe('validateProgressPlan', () => {
  it('rejects duplicate, out-of-period, decreasing, out-of-range, and missing due-date points', () => {
    const errors = validateProgressPlan([
      { date: '2026-07-31', value: 20 },
      { date: '2026-08-10', value: 110 },
      { date: '2026-08-10', value: 50 },
    ], kr);
    expect(errors.map((error) => error.code)).toEqual(expect.arrayContaining([
      'outside_period', 'duplicate_date', 'decreasing_value', 'outside_range', 'missing_due_date',
    ]));
  });

  it('accepts an ascending percentage baseline ending at the due-date target', () => {
    expect(validateProgressPlan([
      { date: '2026-08-01', value: 0 },
      { date: '2026-08-16', value: 50 },
      { date: '2026-08-31', value: 100 },
    ], kr)).toEqual([]);
  });
});

describe('plannedProgressAt', () => {
  it('interpolates deterministically without changing actual snapshots or plan points', () => {
    const points = [{ date: '2026-08-01', value: 0 }, { date: '2026-08-11', value: 100 }];
    const actual = [{ date: '2026-08-06', value: 37 }];
    const before = structuredClone({ points, actual });
    expect(plannedProgressAt(points, '2026-08-06')).toBe(50);
    expect({ points, actual }).toEqual(before);
  });
});
