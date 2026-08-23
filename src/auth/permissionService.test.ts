import { keyResults, objectives, risks } from '../mocks/okr';
import { dailyReports, weeklyReports } from '../mocks/reports';
import { attachments, documents } from '../mocks/security';
import { mockData } from '../mocks/repository';
import { users } from '../mocks/users';
import { getDailyReportPermissionScopes, type ActiveShare, type SystemPermissionScope } from '../domain/permissions';
import { currentBusinessDate } from '../domain/progressStatus';
import { can, getUserPermissionScope } from './permissionService';

const admin = users.find((user) => user.id === 'user-administrator')!;
const management = users.find((user) => user.id === 'user-management')!;
const projectLeader = users.find((user) => user.id === 'user-project-leader')!;
const employee = users.find((user) => user.id === 'user-employee')!;
const projectPeer = users.find((user) => user.id === 'user-project-peer')!;
const hr = users.find((user) => user.id === 'user-hr')!;

const confidentialDocument = documents.find((document) => document.id === 'document-nova-metric-contract')!;
const leaderOwnedKr = keyResults.find((keyResult) => keyResult.id === 'kr-orion-activation')!;
const leaderReport = dailyReports.find((report) => report.id === 'daily-report-leader-2026-08-07')!;
const memberReport = dailyReports.find((report) => report.id === 'daily-report-employee-2026-08-07')!;
const sharedReport = dailyReports.find((report) => report.id === 'daily-report-peer-2026-08-07')!;
const leaderWeeklyReport = weeklyReports.find((report) => report.id === 'weekly-report-orion-2026-08-07')!;
const leaderObjective = objectives.find((objective) => objective.id === 'objective-orion-activation')!;
const leaderRisk = risks.find((risk) => risk.id === 'risk-orion-sample-size')!;
const confidentialAttachment = attachments.find(
  (attachment) => attachment.id === 'attachment-confidential-orion-evidence',
)!;
const restrictedAttachment = attachments.find((attachment) => attachment.id === 'attachment-restricted-nova-access')!;
const orionProject = mockData.projects.find((project) => project.id === 'project-orion')!;
const novaProject = mockData.projects.find((project) => project.id === 'project-nova')!;
const managementPermissionScope: SystemPermissionScope = {
  resourceId: 'system-permission-center',
  resourceType: 'system',
  classification: 'internal',
  systemAction: 'permission.manage',
};

function addActiveShare(share: ActiveShare): () => void {
  mockData.activeShares.push(share);
  return () => {
    const index = mockData.activeShares.indexOf(share);
    if (index >= 0) mockData.activeShares.splice(index, 1);
  };
}

function addAdminProjectMembership(projectId = 'project-orion'): () => void {
  const membership = {
    id: `membership-${projectId}-administrator-test`,
    projectId,
    userId: admin.id,
    membershipRole: 'member' as const,
  };
  mockData.projectMemberships.push(membership);
  return () => {
    const index = mockData.projectMemberships.indexOf(membership);
    if (index >= 0) mockData.projectMemberships.splice(index, 1);
  };
}

describe('can — capability, ownership, and field-level access', () => {
  it('denies anonymous users and incomplete resource context', () => {
    expect(can(undefined, 'dashboard.view')).toEqual({ allowed: false, reason: '需要登录' });
    expect(can(projectLeader, 'okr.update').allowed).toBe(false);
  });

  it('requires typed system metadata for administrator system privileges', () => {
    expect(can(admin, 'permission.manage').allowed).toBe(false);
    expect(can(admin, 'user.manage').allowed).toBe(false);
    expect(can(admin, 'audit.read').allowed).toBe(false);
    expect(can(admin, 'dashboard.view').allowed).toBe(false);
    expect(can(admin, 'permission.manage', managementPermissionScope).allowed).toBe(true);
    expect(can(projectLeader, 'permission.manage', managementPermissionScope).allowed).toBe(false);
    expect(can(admin, 'document.read_body', confidentialDocument).allowed).toBe(false);
  });

  it('allows a project leader to update their own KR but not a member KR', () => {
    const memberOwnedKr = keyResults.find((keyResult) => keyResult.id === 'kr-orion-onboarding')!;

    expect(can(projectLeader, 'okr.update', leaderOwnedKr).allowed).toBe(true);
    expect(can(projectLeader, 'okr.update', memberOwnedKr).allowed).toBe(false);
  });

  it('allows owners to edit only unconfirmed reports from the current business date', () => {
    const editableReport = { ...leaderReport, date: currentBusinessDate(), status: 'submitted' as const };

    expect(can(projectLeader, 'daily_report.create', leaderReport).allowed).toBe(true);
    expect(can(projectLeader, 'daily_report.edit', editableReport).allowed).toBe(true);
    expect(can(projectLeader, 'daily_report.edit', { ...editableReport, status: 'confirmed' }).allowed).toBe(false);
    expect(can(projectLeader, 'daily_report.edit', { ...editableReport, date: '2026-08-20' }).allowed).toBe(false);
    expect(can(projectLeader, 'daily_report.review', memberReport).allowed).toBe(true);
    expect(can(projectLeader, 'daily_report.edit', memberReport).allowed).toBe(false);
  });

  it('allows only employees and project leaders to create self-owned daily reports', () => {
    const employeeOwnedReport = { ...memberReport, authorId: employee.id };
    const managementOwnedReport = { ...sharedReport, authorId: management.id };

    expect(can(employee, 'daily_report.create', employeeOwnedReport).allowed).toBe(true);
    expect(can(projectLeader, 'daily_report.create', leaderReport).allowed).toBe(true);
    expect(can(management, 'daily_report.create', managementOwnedReport).allowed).toBe(false);
    expect(can(admin, 'daily_report.create', managementOwnedReport).allowed).toBe(false);
    expect(can(hr, 'daily_report.create', managementOwnedReport).allowed).toBe(false);
  });

  it('allows HR to read authorized hours but not confidential report content', () => {
    expect(can(hr, 'worklog.read_hours', memberReport).allowed).toBe(true);
    expect(can(hr, 'daily_report.read_body', memberReport).allowed).toBe(false);
  });

  it('accepts the typed daily report body scope for the read-body action', () => {
    const [bodyScope] = getDailyReportPermissionScopes(memberReport);

    expect(bodyScope.resourceType).toBe('daily_report_body');
    expect(can(projectLeader, 'daily_report.read_body', bodyScope).allowed).toBe(true);
    expect(can(employee, 'daily_report.read_body', bodyScope).allowed).toBe(true);
  });

  it('uses the typed user scope for project-member team visibility', () => {
    expect(can(projectLeader, 'user.read', getUserPermissionScope(employee)).allowed).toBe(true);
    expect(can(projectLeader, 'user.read', getUserPermissionScope(hr)).allowed).toBe(false);
  });
});

describe('can — classification and relationship transparency', () => {
  it('authorizes a risk as its own typed resource and applies its classification', () => {
    expect(can(projectLeader, 'risk.read', leaderRisk).allowed).toBe(true);
    expect(
      can(projectLeader, 'risk.read', { ...leaderRisk, classification: 'restricted' }).allowed,
    ).toBe(false);
  });

  it('allows management to read every employee report body but not a restricted attachment without a grant', () => {
    expect(can(management, 'daily_report.read_body', memberReport).allowed).toBe(true);
    expect(can(management, 'attachment.read', restrictedAttachment).allowed).toBe(false);
  });

  it('denies management confidential attachment access without an explicit share', () => {
    expect(can(management, 'attachment.read', confidentialAttachment).allowed).toBe(false);
  });

  it('allows management confidential attachment access with a matching explicit share', () => {
    const removeShare = addActiveShare({
      id: 'share-confidential-orion-attachment-to-management-test',
      resourceId: confidentialAttachment.id,
      resourceType: 'attachment',
      grantedByUserId: confidentialAttachment.ownerId,
      grantedToUserId: management.id,
      createdAt: '2026-08-10T10:00:00Z',
      active: true,
      allowedActions: ['attachment.read'],
    });

    try {
      expect(can(management, 'attachment.read', confidentialAttachment).allowed).toBe(true);
    } finally {
      removeShare();
    }
  });

  it('keeps view-only shares from escalating into export or download grants', () => {
    const removeAttachmentShare = addActiveShare({
      id: 'share-restricted-attachment-view-only-test',
      resourceId: restrictedAttachment.id,
      resourceType: 'attachment',
      grantedByUserId: restrictedAttachment.ownerId,
      grantedToUserId: admin.id,
      createdAt: '2026-08-10T10:10:00Z',
      active: true,
      allowedActions: ['attachment.read'],
    });
    const removeDocumentShare = addActiveShare({
      id: 'share-confidential-document-view-only-test',
      resourceId: confidentialDocument.id,
      resourceType: 'document',
      grantedByUserId: confidentialDocument.ownerId,
      grantedToUserId: admin.id,
      createdAt: '2026-08-10T10:11:00Z',
      active: true,
      allowedActions: ['document.read_body'],
    });

    try {
      expect(can(admin, 'attachment.read', restrictedAttachment).allowed).toBe(true);
      expect(can(admin, 'record.export', restrictedAttachment).allowed).toBe(false);
      expect(can(admin, 'document.read_body', confidentialDocument).allowed).toBe(true);
      expect(can(admin, 'document.download', confidentialDocument).allowed).toBe(false);
    } finally {
      removeDocumentShare();
      removeAttachmentShare();
    }
  });

  it('allows export and download only when the matching action is explicitly granted', () => {
    const removeAttachmentGrant = addActiveShare({
      id: 'grant-restricted-attachment-export-test',
      resourceId: restrictedAttachment.id,
      resourceType: 'attachment',
      grantedByUserId: restrictedAttachment.ownerId,
      grantedToUserId: admin.id,
      createdAt: '2026-08-10T10:12:00Z',
      active: true,
      allowedActions: ['record.export'],
    });
    const removeDocumentGrant = addActiveShare({
      id: 'grant-confidential-document-download-test',
      resourceId: confidentialDocument.id,
      resourceType: 'document',
      grantedByUserId: confidentialDocument.ownerId,
      grantedToUserId: admin.id,
      createdAt: '2026-08-10T10:13:00Z',
      active: true,
      allowedActions: ['document.download'],
    });

    try {
      expect(can(admin, 'record.export', restrictedAttachment).allowed).toBe(true);
      expect(can(admin, 'document.download', confidentialDocument).allowed).toBe(true);
      expect(can(admin, 'attachment.read', restrictedAttachment).allowed).toBe(false);
    } finally {
      removeDocumentGrant();
      removeAttachmentGrant();
    }
  });

  it('allows direct and indirect managers full subordinate detail', () => {
    expect(can(projectLeader, 'daily_report.read_body', memberReport).allowed).toBe(true);
    expect(can(management, 'daily_report.read_body', memberReport).allowed).toBe(true);
  });

  it('allows subordinates manager summaries but denies manager report bodies', () => {
    expect(can(employee, 'okr.read_summary', leaderObjective).allowed).toBe(true);
    expect(can(employee, 'daily_report.read_body', leaderReport).allowed).toBe(false);
  });

  it('allows same-project report detail but independently checks attachment classification', () => {
    expect(can(projectLeader, 'daily_report.read_body', memberReport).allowed).toBe(true);
    expect(can(projectLeader, 'attachment.read', confidentialAttachment).allowed).toBe(false);
  });

  it('allows same-project peers to read reports while still denying confidential attachments', () => {
    expect(can(projectPeer, 'daily_report.read_body', memberReport).allowed).toBe(true);
    expect(can(projectPeer, 'attachment.read', confidentialAttachment).allowed).toBe(false);
  });

  it('requires an explicit relation or active share for cross-project report detail', () => {
    expect(can(projectLeader, 'daily_report.read_body', sharedReport).allowed).toBe(false);
    expect(can(employee, 'daily_report.read_body', sharedReport).allowed).toBe(true);
  });

  it('denies a same-project restricted weekly report body without an explicit share', () => {
    const restrictedWeeklyReport = { ...leaderWeeklyReport, classification: 'restricted' as const };

    expect(can(projectLeader, 'weekly_report.read', restrictedWeeklyReport).allowed).toBe(false);
    expect(can(projectLeader, 'weekly_report.read_body', restrictedWeeklyReport).allowed).toBe(false);
  });

  it('keeps export independent from read access and denies restricted export without a grant', () => {
    expect(can(management, 'record.export', memberReport).allowed).toBe(false);
    expect(can(employee, 'record.export', memberReport).allowed).toBe(false);
    expect(can(management, 'record.export', restrictedAttachment).allowed).toBe(false);
  });

  it('limits project management to the named project leader instead of all Management projects', () => {
    expect(can(management, 'okr.read_detail', orionProject).allowed).toBe(true);
    expect(can(management, 'project.manage', orionProject).allowed).toBe(false);
    expect(can(management, 'project.manage', novaProject).allowed).toBe(true);
    expect(can(projectLeader, 'project.manage', orionProject).allowed).toBe(true);
    expect(can(projectLeader, 'project.manage', novaProject).allowed).toBe(false);
  });

  it('exports only explicitly compatible business resources', () => {
    const workload = mockData.workloads[0]!;

    expect(can(management, 'record.export', workload).allowed).toBe(false);
    expect(can(management, 'record.export', memberReport).allowed).toBe(false);
  });

  it('allows organization-public OKR summaries without a project relationship', () => {
    const publicObjective = { ...leaderObjective, classification: 'public' as const };

    expect(can(admin, 'okr.read_summary', publicObjective).allowed).toBe(true);
  });

  it('allows a project-member admin ordinary project detail but requires grants for confidential resources', () => {
    const removeMembership = addAdminProjectMembership();
    const removeNovaMembership = addAdminProjectMembership('project-nova');

    try {
      expect(can(admin, 'daily_report.read_body', leaderReport).allowed).toBe(true);
      expect(can(admin, 'attachment.read', confidentialAttachment).allowed).toBe(false);
      expect(can(admin, 'attachment.read', restrictedAttachment).allowed).toBe(false);
      expect(can(admin, 'document.read_body', confidentialDocument).allowed).toBe(false);
    } finally {
      removeNovaMembership();
      removeMembership();
    }
  });

  it('allows a project-member admin confidential attachment access only with a matching explicit share', () => {
    const removeMembership = addAdminProjectMembership();
    const removeShare = addActiveShare({
      id: 'share-confidential-orion-attachment-to-admin-test',
      resourceId: confidentialAttachment.id,
      resourceType: 'attachment',
      grantedByUserId: confidentialAttachment.ownerId,
      grantedToUserId: admin.id,
      createdAt: '2026-08-10T10:00:00Z',
      active: true,
      allowedActions: ['attachment.read'],
    });

    try {
      expect(can(admin, 'attachment.read', confidentialAttachment).allowed).toBe(true);
    } finally {
      removeShare();
      removeMembership();
    }
  });

  it('allows a project-member admin confidential documents and restricted attachments only with matching explicit shares', () => {
    const removeNovaMembership = addAdminProjectMembership('project-nova');
    const removeDocumentShare = addActiveShare({
      id: 'share-confidential-nova-document-to-admin-test',
      resourceId: confidentialDocument.id,
      resourceType: 'document',
      grantedByUserId: confidentialDocument.ownerId,
      grantedToUserId: admin.id,
      createdAt: '2026-08-10T10:00:00Z',
      active: true,
      allowedActions: ['document.read_body'],
    });
    const removeAttachmentShare = addActiveShare({
      id: 'share-restricted-nova-attachment-to-admin-test',
      resourceId: restrictedAttachment.id,
      resourceType: 'attachment',
      grantedByUserId: restrictedAttachment.ownerId,
      grantedToUserId: admin.id,
      createdAt: '2026-08-10T10:00:00Z',
      active: true,
      allowedActions: ['attachment.read'],
    });

    try {
      expect(can(admin, 'document.read_body', confidentialDocument).allowed).toBe(true);
      expect(can(admin, 'attachment.read', restrictedAttachment).allowed).toBe(true);
    } finally {
      removeAttachmentShare();
      removeDocumentShare();
      removeNovaMembership();
    }
  });
});
