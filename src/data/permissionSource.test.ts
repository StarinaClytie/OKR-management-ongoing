import { afterEach, describe, expect, it } from 'vitest';
import { buildPermissionSource } from './permissionSource';
import { can, configurePermissionSource, getPermissionSource } from '../auth/permissionService';
import { getDailyReportBodyPermissionScope } from '../domain/permissions';
import type { DashboardData } from './types';
import type { DailyReport, Project, User } from '../domain/types';

// Deliberately built from scratch rather than from `src/mocks/*`. The global
// test setup seeds the evaluator with the demo fixtures, which is exactly why
// the "project leader sees no member reports" defect survived the suite: every
// existing test asserted against relationship data that production never had.
// These tests reproduce Supabase mode, where the only relationship data is what
// the dashboard payload carries.

const alice: User = {
  id: 'alice', name: 'Alice', role: 'project_leader', clearance: 'internal',
  title: '负责人', department: '交付部', projectIds: ['project-a'],
};
const bob: User = {
  id: 'bob', name: 'Bob', role: 'employee', clearance: 'internal',
  title: '工程师', department: '交付部', projectIds: ['project-a'],
};
const dana: User = {
  id: 'dana', name: 'Dana', role: 'employee', clearance: 'internal',
  title: '工程师', department: '研究部', projectIds: ['project-b'],
};
const management: User = {
  id: 'mona', name: 'Mona', role: 'management', clearance: 'confidential',
  title: '管理层', department: '经营部', projectIds: [],
};

const projectA: Project = {
  id: 'project-a', name: 'Project A', description: '', leaderId: alice.id,
  memberIds: [alice.id, bob.id], classification: 'internal',
  startDate: '2026-08-01', dueDate: '2026-09-30', status: 'on_track',
};
const projectB: Project = {
  id: 'project-b', name: 'Project B', description: '', leaderId: 'erin',
  memberIds: ['erin', dana.id], classification: 'internal',
  startDate: '2026-08-01', dueDate: '2026-09-30', status: 'on_track',
};

function report(authorId: string, projectId: string): DailyReport {
  return {
    id: `report-${authorId}`, authorId, projectId, objectiveId: 'objective-1', keyResultIds: ['kr-1'],
    date: '2026-08-24', content: '今日目标', classification: 'internal', hours: 8,
    evidence: [], evidenceClassification: 'public', attachmentIds: [], status: 'submitted', currentRevision: 1,
  };
}

const bobReport = report(bob.id, projectA.id);
const danaReport = report(dana.id, projectB.id);

function dashboard(): DashboardData {
  return {
    currentUser: alice, users: [alice, bob, dana, management], dailyReports: [bobReport, danaReport],
    projects: [projectA, projectB], objectives: [], keyResults: [], krAssignments: [], krProgressUpdates: [],
    milestones: [], risks: [], progressSnapshots: [], workloads: [], attachments: [],
    companyObjectives: [], projectTasks: [],
  };
}

const demoSource = getPermissionSource();
afterEach(() => configurePermissionSource(demoSource));

describe('buildPermissionSource', () => {
  it('derives one leader membership and one member membership per project', () => {
    const source = buildPermissionSource(dashboard());

    expect(source.projectMemberships).toEqual([
      { id: 'project-a:alice', projectId: 'project-a', userId: 'alice', membershipRole: 'leader' },
      { id: 'project-a:bob', projectId: 'project-a', userId: 'bob', membershipRole: 'member' },
      { id: 'project-b:erin', projectId: 'project-b', userId: 'erin', membershipRole: 'leader' },
      { id: 'project-b:dana', projectId: 'project-b', userId: 'dana', membershipRole: 'member' },
    ]);
  });

  it('does not duplicate a leader who is also listed as a project member', () => {
    const data = dashboard();
    data.projects = [{ ...projectA, memberIds: [alice.id, bob.id, alice.id] }];

    const aliceMemberships = buildPermissionSource(data).projectMemberships.filter((membership) => membership.userId === alice.id);

    expect(aliceMemberships).toEqual([{ id: 'project-a:alice', projectId: 'project-a', userId: 'alice', membershipRole: 'leader' }]);
  });

  it('leaves server-only relationships empty rather than inventing them', () => {
    const source = buildPermissionSource(dashboard());

    expect(source.organizationRelations).toEqual([]);
    expect(source.activeShares).toEqual([]);
    expect(source.collaborationRelations).toEqual([]);
  });
});

describe('daily report visibility under a Supabase-derived permission source', () => {
  it('lets a project leader read and review reports from their own project members', () => {
    configurePermissionSource(buildPermissionSource(dashboard()));

    expect(can(alice, 'daily_report.read_body', getDailyReportBodyPermissionScope(bobReport)).allowed).toBe(true);
    expect(can(alice, 'daily_report.review', bobReport).allowed).toBe(true);
  });

  it('keeps a project leader out of another project\'s reports', () => {
    configurePermissionSource(buildPermissionSource(dashboard()));

    expect(can(alice, 'daily_report.read_body', getDailyReportBodyPermissionScope(danaReport)).allowed).toBe(false);
    expect(can(alice, 'daily_report.review', danaReport).allowed).toBe(false);
  });

  it('never lets a leader review their own report through the member path', () => {
    configurePermissionSource(buildPermissionSource(dashboard()));
    const aliceReport = report(alice.id, projectA.id);

    expect(can(alice, 'daily_report.read_body', getDailyReportBodyPermissionScope(aliceReport)).allowed).toBe(true);
    expect(can(alice, 'daily_report.review', aliceReport).allowed).toBe(false);
  });

  it('leaves an employee with their own report only', () => {
    configurePermissionSource(buildPermissionSource(dashboard()));

    expect(can(bob, 'daily_report.read_body', getDailyReportBodyPermissionScope(bobReport)).allowed).toBe(true);
    expect(can(bob, 'daily_report.review', bobReport).allowed).toBe(false);
    expect(can(bob, 'daily_report.read_body', getDailyReportBodyPermissionScope(danaReport)).allowed).toBe(false);
  });

  it('keeps management organization-wide without any project membership', () => {
    configurePermissionSource(buildPermissionSource(dashboard()));

    expect(can(management, 'daily_report.read_body', getDailyReportBodyPermissionScope(bobReport)).allowed).toBe(true);
    expect(can(management, 'daily_report.review', bobReport).allowed).toBe(true);
    expect(can(management, 'daily_report.review', danaReport).allowed).toBe(true);
  });

  it('reproduces the defect when the evaluator has no relationship data', () => {
    configurePermissionSource({
      projectMemberships: [], organizationRelations: [], activeShares: [],
      collaborationRelations: [], workloads: [], objectives: [],
    });

    expect(can(alice, 'daily_report.read_body', getDailyReportBodyPermissionScope(bobReport)).allowed).toBe(false);
    expect(can(alice, 'daily_report.review', bobReport).allowed).toBe(false);
  });
});
