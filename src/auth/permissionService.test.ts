import { keyResults, objectives } from '../mocks/okr';
import { dailyReports } from '../mocks/reports';
import { attachments, documents } from '../mocks/security';
import { users } from '../mocks/users';
import { can } from './permissionService';

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
const leaderObjective = objectives.find((objective) => objective.id === 'objective-orion-activation')!;
const confidentialAttachment = attachments.find(
  (attachment) => attachment.id === 'attachment-confidential-orion-evidence',
)!;
const restrictedAttachment = attachments.find((attachment) => attachment.id === 'attachment-restricted-nova-access')!;

describe('can — capability, ownership, and field-level access', () => {
  it('denies anonymous users and incomplete resource context', () => {
    expect(can(undefined, 'dashboard.view')).toEqual({ allowed: false, reason: '需要登录' });
    expect(can(projectLeader, 'okr.update').allowed).toBe(false);
  });

  it('allows administrator system privileges without implying confidential body access', () => {
    expect(can(admin, 'permission.manage').allowed).toBe(true);
    expect(can(admin, 'document.read_body', confidentialDocument).allowed).toBe(false);
  });

  it('allows a project leader to update their own KR but not a member KR', () => {
    const memberOwnedKr = keyResults.find((keyResult) => keyResult.id === 'kr-orion-onboarding')!;

    expect(can(projectLeader, 'okr.update', leaderOwnedKr).allowed).toBe(true);
    expect(can(projectLeader, 'okr.update', memberOwnedKr).allowed).toBe(false);
  });

  it('allows project leaders to author their own reports and review but never edit member bodies', () => {
    expect(can(projectLeader, 'daily_report.create', leaderReport).allowed).toBe(true);
    expect(can(projectLeader, 'daily_report.edit', leaderReport).allowed).toBe(true);
    expect(can(projectLeader, 'daily_report.review', memberReport).allowed).toBe(true);
    expect(can(projectLeader, 'daily_report.edit', memberReport).allowed).toBe(false);
  });

  it('allows HR to read authorized hours but not confidential report content', () => {
    expect(can(hr, 'worklog.read_hours', memberReport).allowed).toBe(true);
    expect(can(hr, 'daily_report.read_body', memberReport).allowed).toBe(false);
  });
});

describe('can — classification and relationship transparency', () => {
  it('allows management to read every employee report body but not a restricted attachment without a grant', () => {
    expect(can(management, 'daily_report.read_body', memberReport).allowed).toBe(true);
    expect(can(management, 'attachment.read', restrictedAttachment).allowed).toBe(false);
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

  it('keeps export independent from read access and denies restricted export without a grant', () => {
    expect(can(management, 'record.export', memberReport).allowed).toBe(true);
    expect(can(employee, 'record.export', memberReport).allowed).toBe(false);
    expect(can(management, 'record.export', restrictedAttachment).allowed).toBe(false);
  });

  it('allows organization-public OKR summaries without a project relationship', () => {
    const publicObjective = { ...leaderObjective, classification: 'public' as const };

    expect(can(admin, 'okr.read_summary', publicObjective).allowed).toBe(true);
  });
});
