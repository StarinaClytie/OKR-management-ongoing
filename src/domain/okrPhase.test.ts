import { describe, expect, it } from 'vitest';
import { collaboratorsOfKr, isKrCollaborator, ownersOfKr } from './krAssignments';
import { deriveKeyResultProgress, deriveObjectiveProgress } from './okrMetrics';
import { canCreateObjective, canEditObjective, canManageKeyResults, canUpdateKeyResultProgress } from './okrPermissions';
import { deriveOkrStatus, resolveOkrStatus } from './okrStatus';
import { filterObjectiveSummaries, summarizeObjective, type ObjectiveSummary } from './objectivePortfolio';
import type { KeyResult, KrAssignment, Objective, User } from './types';

const management: User = { id: 'mgr', name: '管理层', role: 'management', clearance: 'internal', title: '', department: '', projectIds: [] };
const leader: User = { id: 'leader', name: '负责人', role: 'project_leader', clearance: 'internal', title: '', department: '', projectIds: [] };
const employee: User = { id: 'emp', name: '员工', role: 'employee', clearance: 'internal', title: '', department: '', projectIds: [] };

const objective = (overrides: Partial<Objective> = {}): Objective => ({
  id: 'o1', projectId: 'p1', title: 'O1', description: '', ownerId: 'leader', progress: 50, status: 'on_track',
  startDate: '2026-07-01', dueDate: '2026-09-30', classification: 'internal', ...overrides,
});

const keyResult = (overrides: Partial<KeyResult> = {}): KeyResult => ({
  id: 'kr1', objectiveId: 'o1', title: 'KR1', ownerId: 'emp', progress: 40, status: 'on_track',
  startDate: '2026-07-01', dueDate: '2026-09-30', classification: 'internal', ...overrides,
});

describe('okr status derivation', () => {
  it('marks past-due unfinished objectives as delayed', () => {
    expect(deriveOkrStatus(40, '2026-07-01', '2026-08-01', '2026-08-19')).toBe('delayed');
  });
  it('marks future-start objectives as not started', () => {
    expect(deriveOkrStatus(0, '2026-09-01', '2026-09-30', '2026-08-19')).toBe('not_started');
  });
  it('marks completed objectives as completed regardless of dates', () => {
    expect(deriveOkrStatus(100, '2026-07-01', '2026-07-15', '2026-08-19')).toBe('completed');
  });
  it('falls back to derivation when no stored status exists', () => {
    expect(resolveOkrStatus(undefined, 40, '2026-07-01', '2026-08-01', '2026-08-19')).toBe('delayed');
  });
  it('prefers a stored status over derivation', () => {
    expect(resolveOkrStatus('on_track', 40, '2026-07-01', '2026-08-01', '2026-08-19')).toBe('on_track');
  });
});

describe('KR metrics', () => {
  it('derives numeric progress as current / target', () => {
    expect(deriveKeyResultProgress({ metricType: 'numeric', currentValue: 31.2, targetValue: 35, progress: 0 })).toBe(89);
  });
  it('derives percentage progress', () => {
    expect(deriveKeyResultProgress({ metricType: 'percentage', currentValue: 88, targetValue: 92, progress: 0 })).toBe(96);
  });
  it('returns null for milestone and non-positive targets', () => {
    expect(deriveKeyResultProgress({ metricType: 'milestone', currentValue: 1, targetValue: 1, progress: 0 })).toBeNull();
    expect(deriveKeyResultProgress({ metricType: 'numeric', currentValue: 5, targetValue: 0, progress: 0 })).toBeNull();
  });
  it('averages KR progress into objective progress', () => {
    expect(deriveObjectiveProgress([{ progress: 82 }, { progress: 68 }, { progress: 42 }])).toBe(64);
  });
  it('returns zero for no KRs', () => {
    expect(deriveObjectiveProgress([])).toBe(0);
  });
});

describe('KR assignments', () => {
  const assignments: KrAssignment[] = [
    { id: 'a1', krId: 'kr1', userId: 'emp', assignmentRole: 'owner' },
    { id: 'a2', krId: 'kr1', userId: 'peer', assignmentRole: 'collaborator' },
  ];
  it('separates owners from collaborators', () => {
    expect(ownersOfKr('kr1', assignments)).toEqual(['emp']);
    expect(collaboratorsOfKr('kr1', assignments)).toEqual(['peer']);
  });
  it('detects collaboration', () => {
    expect(isKrCollaborator('peer', 'kr1', assignments)).toBe(true);
    expect(isKrCollaborator('emp', 'kr1', assignments)).toBe(false);
  });
});

describe('objective portfolio filters', () => {
  const krs = [keyResult({ id: 'kr1', objectiveId: 'o1', ownerId: 'emp' })];
  const summaries: ObjectiveSummary[] = [
    summarizeObjective(objective({ id: 'o1', ownerId: 'leader' }), krs, [], '2026-08-19'),
  ];
  const assignments: KrAssignment[] = [{ id: 'a1', krId: 'kr1', userId: 'emp', assignmentRole: 'owner' }];

  it('shows all to management on the mine filter', () => {
    expect(filterObjectiveSummaries('mine', summaries, management, assignments)).toHaveLength(1);
  });
  it('shows led objectives to a project leader', () => {
    expect(filterObjectiveSummaries('mine', summaries, leader, assignments)).toHaveLength(1);
    expect(filterObjectiveSummaries('mine', summaries, employee, assignments)).toHaveLength(0);
  });
  it('shows objectives with owned KRs on the myKrs filter', () => {
    expect(filterObjectiveSummaries('myKrs', summaries, employee, assignments)).toHaveLength(1);
  });
  it('counts updates per objective', () => {
    const summary = summarizeObjective(
      objective({ id: 'o1' }),
      krs,
      [{ id: 'u1', krId: 'kr1', authorId: 'emp', previousProgress: 30, newProgress: 40, summary: '推进', createdAt: '2026-08-18T00:00:00Z' }],
      '2026-08-19',
    );
    expect(summary.updateCount).toBe(1);
  });
});

describe('OKR permissions', () => {
  it('allows only management to create objectives', () => {
    expect(canCreateObjective(management)).toBe(true);
    expect(canCreateObjective(leader)).toBe(false);
    expect(canCreateObjective({ ...employee, role: 'administrator' })).toBe(false);
  });
  it('lets only management edit an objective definition', () => {
    expect(canEditObjective(leader, objective({ ownerId: 'leader' }))).toBe(false);
    expect(canEditObjective(management, objective({ ownerId: 'other' }))).toBe(true);
  });
  it('lets leaders manage KRs in objectives they lead', () => {
    expect(canManageKeyResults(leader, objective({ ownerId: 'leader' }))).toBe(true);
    expect(canManageKeyResults(management, objective({ ownerId: 'leader' }))).toBe(false);
    expect(canManageKeyResults(employee, objective({ ownerId: 'leader' }))).toBe(false);
    expect(canManageKeyResults({ ...leader, role: 'employee' }, objective({ ownerId: 'leader' }))).toBe(false);
  });
  it('lets a KR owner or leader update progress, but not an unrelated employee', () => {
    const assignments: KrAssignment[] = [{ id: 'a1', krId: 'kr1', userId: 'emp', assignmentRole: 'owner' }];
    expect(canUpdateKeyResultProgress(employee, objective({ ownerId: 'leader' }), keyResult({ ownerId: 'emp' }), assignments)).toBe(true);
    expect(canUpdateKeyResultProgress(leader, objective({ ownerId: 'leader' }), keyResult({ ownerId: 'emp' }), assignments)).toBe(true);
    const other = { ...employee, id: 'other' };
    expect(canUpdateKeyResultProgress(other, objective({ ownerId: 'leader' }), keyResult({ ownerId: 'emp' }), assignments)).toBe(false);
  });
});
