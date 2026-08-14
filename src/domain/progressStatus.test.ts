import { describe, expect, it } from 'vitest';
import { deriveProgressStatus } from './progressStatus';

const base = {
  actualProgress: 50,
  plannedProgress: 60,
  evaluationDate: '2026-08-13',
  dueDate: '2026-08-31',
  milestones: [],
  risks: [],
};

describe('deriveProgressStatus', () => {
  it.each([
    [-10, 'on_track'],
    [-11, 'at_risk'],
    [-25, 'at_risk'],
    [-26, 'off_track'],
  ] as const)('maps a %s point gap to %s', (gap, status) => {
    expect(deriveProgressStatus({ ...base, actualProgress: 60 + gap }).status).toBe(status);
  });

  it('marks employee-entered 100 percent complete without mutating the input', () => {
    const input = { ...base, actualProgress: 100 };
    const snapshot = structuredClone(input);
    expect(deriveProgressStatus(input).status).toBe('complete');
    expect(input).toEqual(snapshot);
  });

  it('does not short-circuit parallel milestone and risk rules at 100 percent', () => {
    const result = deriveProgressStatus({
      ...base,
      actualProgress: 100,
      milestones: [{ dueDate: '2026-08-12', isComplete: false }],
      risks: [{ score: 9, resolved: false }],
    });

    expect(result.status).toBe('off_track');
    expect(result.reasons.map((reason) => reason.code)).toEqual([
      'overdue_milestone',
      'critical_risk',
      'complete',
    ]);
  });

  it('uses milestone, due-date, and risk overrides', () => {
    expect(deriveProgressStatus({ ...base, milestones: [{ dueDate: '2026-08-12', isComplete: false }] }).status).toBe('at_risk');
    expect(deriveProgressStatus({ ...base, actualProgress: 99, evaluationDate: '2026-09-01' }).status).toBe('off_track');
    expect(deriveProgressStatus({ ...base, risks: [{ score: 6, resolved: false }] }).status).toBe('at_risk');
    expect(deriveProgressStatus({ ...base, risks: [{ score: 9, resolved: false }] }).status).toBe('off_track');
  });

  it('keeps low and medium events separate from status escalation while evaluating every rule in parallel', () => {
    for (const score of [1, 2, 3, 4]) {
      expect(deriveProgressStatus({ ...base, risks: [{ score, resolved: false }] }).status).toBe('on_track');
    }
    expect(deriveProgressStatus({ ...base, risks: [{ score: 6, resolved: false }] }).status).toBe('at_risk');
    expect(deriveProgressStatus({ ...base, risks: [{ score: 9, resolved: false }] }).status).toBe('off_track');

    const result = deriveProgressStatus({
      ...base,
      actualProgress: 49,
      milestones: [{ dueDate: '2026-08-12', isComplete: false }],
      risks: [{ score: 9, resolved: false }],
    });

    expect(result.status).toBe('off_track');
    expect(result.reasons.map((reason) => reason.code)).toEqual(['behind_plan', 'overdue_milestone', 'critical_risk']);
  });

  it('returns all explanations while the most severe status wins', () => {
    const result = deriveProgressStatus({
      ...base,
      actualProgress: 49,
      risks: [{ score: 9, resolved: false }],
      milestones: [{ dueDate: '2026-08-12', isComplete: false }],
    });
    expect(result.status).toBe('off_track');
    expect(result.reasons.map((reason) => reason.code)).toEqual(['behind_plan', 'overdue_milestone', 'critical_risk']);
  });
});
