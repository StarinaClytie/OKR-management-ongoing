import { afterEach, describe, expect, it } from 'vitest';
import type { DailyReport, KeyResult, KrAssignment, Objective, ObjectiveOwner, User } from '../domain/types';
import { currentBusinessDate } from '../domain/progressStatus';
import { can, configurePermissionSource, getPermissionSource } from './permissionService';

const hr: User = { id: 'hr1', name: '孙悦', role: 'hr', clearance: 'internal', title: '', department: '人力资源部', projectIds: [] };
const otherHr: User = { id: 'hr2', name: '赵峰', role: 'hr', clearance: 'internal', title: '', department: '人力资源部', projectIds: [] };

const objective = (overrides: Partial<Objective> = {}): Objective => ({
  id: 'o1', projectId: 'p1', title: '招聘体系建设', description: '', ownerId: 'leader', progress: 0, status: 'on_track',
  startDate: '2026-08-01', dueDate: '2026-09-30', classification: 'internal', objectiveType: 'hr', ...overrides,
});

const keyResult = (overrides: Partial<KeyResult> = {}): KeyResult => ({
  id: 'kr1', objectiveId: 'o1', title: '完成20人招聘', ownerId: 'hr1', progress: 0, status: 'on_track',
  startDate: '2026-08-01', dueDate: '2026-09-30', classification: 'internal', ...overrides,
});

const dailyReport = (overrides: Partial<DailyReport> = {}): DailyReport => ({
  id: 'r1', authorId: 'hr1', projectId: 'p1', objectiveId: 'o1', keyResultIds: ['kr1'],
  date: currentBusinessDate(), content: '招聘推进', classification: 'internal', hours: 3,
  evidence: [], evidenceClassification: 'internal', attachmentIds: [], status: 'submitted', ...overrides,
});

const source = {
  projectMemberships: [],
  organizationRelations: [],
  activeShares: [],
  collaborationRelations: [],
  workloads: [],
  objectives: [objective()],
  krAssignments: [{ id: 'a1', krId: 'kr1', userId: 'hr1', assignmentRole: 'owner' }] as KrAssignment[],
  objectiveOwners: [{ id: 'oo1', objectiveId: 'o1', userId: 'hr1', roleType: 'hr' }] as ObjectiveOwner[],
};

const demoSource = getPermissionSource();
afterEach(() => configurePermissionSource(demoSource));

describe('HR OKR visibility', () => {
  beforeEach(() => configurePermissionSource(source));

  it('lets HR read an HR Objective summary', () => {
    expect(can(hr, 'okr.read_summary', objective()).allowed).toBe(true);
  });

  it('keeps HR out of business Objectives', () => {
    expect(can(hr, 'okr.read_summary', objective({ objectiveType: 'business' })).allowed).toBe(false);
  });

  it('lets HR read an HR KR (owner or any HR)', () => {
    expect(can(hr, 'okr.read_detail', keyResult()).allowed).toBe(true);
    expect(can(otherHr, 'okr.read_detail', keyResult()).allowed).toBe(true);
  });
});

describe('HR daily-report authoring', () => {
  beforeEach(() => configurePermissionSource(source));

  it('lets an HR KR owner create and edit their own report', () => {
    expect(can(hr, 'daily_report.create', dailyReport()).allowed).toBe(true);
    expect(can(hr, 'daily_report.edit', dailyReport()).allowed).toBe(true);
  });

  it('blocks HR from creating a report authored by someone else', () => {
    expect(can(otherHr, 'daily_report.create', dailyReport()).allowed).toBe(false);
  });
});
