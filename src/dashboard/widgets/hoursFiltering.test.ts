import { describe, expect, it } from 'vitest';
import { applyHourFilters, buildHourEntries, type HourEntry } from './hoursFiltering';
import type { DashboardData } from '../../data/types';

const entries: HourEntry[] = [
  { userId: 'u1', date: '2026-08-05', projectId: 'p1', objectiveId: 'o1', keyResultId: 'k1', quarter: '2026-Q3', hours: 3 },
  { userId: 'u1', date: '2026-08-19', projectId: 'p1', objectiveId: 'o1', keyResultId: 'k2', quarter: '2026-Q3', hours: 2 },
  { userId: 'u2', date: '2026-08-19', projectId: 'p2', objectiveId: 'o2', keyResultId: 'k3', quarter: '2026-Q3', hours: 5 },
  { userId: 'u2', date: '2026-07-10', projectId: 'p2', objectiveId: 'o2', keyResultId: 'k3', quarter: '2026-Q2', hours: 4 },
];

describe('applyHourFilters', () => {
  it('filters by date range', () => {
    expect(applyHourFilters(entries, { fromDate: '2026-08-01', toDate: '2026-08-31' })).toHaveLength(3);
  });

  it('filters by employee', () => {
    expect(applyHourFilters(entries, { employeeId: 'u2' })).toHaveLength(2);
  });

  it('filters by project', () => {
    expect(applyHourFilters(entries, { projectId: 'p1' })).toHaveLength(2);
  });

  it('filters by objective', () => {
    expect(applyHourFilters(entries, { objectiveId: 'o2' })).toHaveLength(2);
  });

  it('filters by KR', () => {
    expect(applyHourFilters(entries, { keyResultId: 'k3' })).toHaveLength(2);
  });

  it('filters by quarter', () => {
    expect(applyHourFilters(entries, { quarter: '2026-Q2' })).toHaveLength(1);
  });

  it('combines filters', () => {
    expect(applyHourFilters(entries, { employeeId: 'u1', objectiveId: 'o1', keyResultId: 'k2' })).toEqual([
      expect.objectContaining({ keyResultId: 'k2', hours: 2 }),
    ]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(applyHourFilters(entries, { employeeId: 'u-missing' })).toEqual([]);
  });
});

describe('buildHourEntries scoping', () => {
  function dataFor(role: 'management' | 'project_leader' | 'employee'): DashboardData {
    return {
      currentUser: { id: role === 'project_leader' ? 'leader' : 'self', name: role, role, clearance: 'internal', title: '', department: '', projectIds: [] },
      users: [
        { id: 'leader', name: 'Leader', role: 'project_leader', clearance: 'internal', title: '', department: '', projectIds: [] },
        { id: 'self', name: 'Self', role, clearance: 'internal', title: '', department: '', projectIds: [] },
        { id: 'other', name: 'Other', role: 'employee', clearance: 'internal', title: '', department: '', projectIds: [] },
      ],
      projects: [
        { id: 'p1', name: 'P1', description: '', leaderId: 'leader', memberIds: [], classification: 'internal', startDate: '', dueDate: '', status: 'on_track' },
        { id: 'p2', name: 'P2', description: '', leaderId: 'other', memberIds: [], classification: 'internal', startDate: '', dueDate: '', status: 'on_track' },
      ],
      objectives: [
        { id: 'o1', projectId: 'p1', title: 'O1', description: '', ownerId: 'leader', progress: 0, status: 'on_track', startDate: '', dueDate: '', classification: 'internal', quarter: '2026-Q3' },
        { id: 'o2', projectId: 'p2', title: 'O2', description: '', ownerId: 'other', progress: 0, status: 'on_track', startDate: '', dueDate: '', classification: 'internal', quarter: '2026-Q3' },
      ],
      keyResults: [
        { id: 'k1', objectiveId: 'o1', title: 'K1', ownerId: 'leader', progress: 0, status: 'on_track', startDate: '', dueDate: '', classification: 'internal' },
        { id: 'k2', objectiveId: 'o2', title: 'K2', ownerId: 'other', progress: 0, status: 'on_track', startDate: '', dueDate: '', classification: 'internal' },
      ],
      dailyReports: [
        { id: 'r1', authorId: 'other', projectId: 'p1', objectiveId: 'o1', keyResultIds: ['k1'], date: '2026-08-19', content: '', classification: 'internal', hours: 3, evidence: [], evidenceClassification: 'internal', attachmentIds: [], status: 'submitted', blocks: [{ id: 'b1', dailyObjective: 'O', keyResultId: 'k1', hours: 3, result: '', keyResults: [{ id: 'kr1', title: 'KR' }] }] },
        { id: 'r2', authorId: 'other', projectId: 'p2', objectiveId: 'o2', keyResultIds: ['k2'], date: '2026-08-19', content: '', classification: 'internal', hours: 5, evidence: [], evidenceClassification: 'internal', attachmentIds: [], status: 'submitted', blocks: [{ id: 'b2', dailyObjective: 'O', keyResultId: 'k2', hours: 5, result: '', keyResults: [{ id: 'kr2', title: 'KR' }] }] },
      ],
      krAssignments: [],
      krProgressUpdates: [],
      objectiveOwners: [],
      milestones: [],
      risks: [],
      progressSnapshots: [],
      workloads: [],
      attachments: [],
      companyObjectives: [],
      projectTasks: [],
    };
  }

  it('management sees all entries', () => {
    expect(buildHourEntries(dataFor('management'))).toHaveLength(2);
  });

  it('project leader sees only blocks under objectives they lead', () => {
    const entriesForLeader = buildHourEntries(dataFor('project_leader'));
    expect(entriesForLeader).toHaveLength(1);
    expect(entriesForLeader[0]).toMatchObject({ objectiveId: 'o1', keyResultId: 'k1' });
  });

  it('employee sees only their own reports', () => {
    const data = dataFor('employee');
    data.currentUser.id = 'other';
    const entriesForEmployee = buildHourEntries(data);
    expect(entriesForEmployee).toHaveLength(2);
    expect(entriesForEmployee.every((entry) => entry.userId === 'other')).toBe(true);
  });
});
