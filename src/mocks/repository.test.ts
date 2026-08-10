import { describe, expect, it } from 'vitest';
import { getAttachmentPermissionScope, getDailyReportPermissionScopes } from '../domain/permissions';
import { keyResults, objectives, projects } from './okr';
import { dailyReports } from './reports';
import { activeShares, attachments, collaborationRelations } from './security';
import { organizationRelations, projectMemberships } from './users';
import { mockData, mockRepository, validateRepositoryIntegrity } from './repository';

describe('mockRepository', () => {
  it('models a project leader who personally owns a KR', () => {
    const data = mockRepository.getDashboardData('user-project-leader');

    expect(data.keyResults.some((keyResult) => keyResult.ownerId === data.currentUser.id)).toBe(true);
  });

  it('provides twelve weekly points for honest trend rendering', () => {
    const data = mockRepository.getDashboardData('user-project-leader');

    expect(data.progressSnapshots).toHaveLength(12);
  });

  it('keeps direct and indirect manager relations available to later permission checks', () => {
    expect(organizationRelations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ managerId: 'user-project-leader', subordinateId: 'user-employee', depth: 1 }),
        expect.objectContaining({ managerId: 'user-management', subordinateId: 'user-employee', depth: 2 }),
      ]),
    );
  });

  it('models same-project peers, an explicit cross-project collaboration, and an active report share', () => {
    expect(projectMemberships.filter((membership) => membership.projectId === 'project-orion')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: 'user-project-leader' }),
        expect.objectContaining({ userId: 'user-employee' }),
      ]),
    );
    expect(collaborationRelations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          viewerId: 'user-employee',
          subjectUserId: 'user-project-peer',
          projectId: 'project-nova',
          sharedResourceIds: expect.arrayContaining(['daily-report-peer-2026-08-07']),
        }),
      ]),
    );
    expect(activeShares).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resourceId: 'daily-report-peer-2026-08-07',
          grantedToUserId: 'user-employee',
          active: true,
        }),
      ]),
    );
  });

  it('supplies attachments at every classification level for independent attachment checks', () => {
    expect(new Set(attachments.map((attachment) => attachment.classification))).toEqual(
      new Set(['public', 'internal', 'confidential', 'restricted']),
    );
  });

  it('exposes separate typed scopes for a daily report body, its evidence, and its attachments', () => {
    const report = dailyReports.find((item) => item.id === 'daily-report-employee-2026-08-07');
    const attachment = attachments.find((item) => item.id === 'attachment-confidential-orion-evidence');

    expect(report).toBeDefined();
    expect(attachment).toBeDefined();
    expect(getDailyReportPermissionScopes(report!)).toEqual([
      {
        resourceId: 'daily-report-employee-2026-08-07',
        resourceType: 'daily_report_body',
        ownerId: 'user-employee',
        projectId: 'project-orion',
        classification: 'confidential',
      },
      {
        resourceId: 'daily-report-employee-2026-08-07:evidence',
        resourceType: 'evidence',
        ownerId: 'user-employee',
        projectId: 'project-orion',
        parentResourceId: 'daily-report-employee-2026-08-07',
        classification: 'confidential',
      },
    ]);
    expect(getAttachmentPermissionScope(attachment!)).toEqual({
      resourceId: 'attachment-confidential-orion-evidence',
      resourceType: 'attachment',
      ownerId: 'user-employee',
      projectId: 'project-orion',
      parentResourceId: 'daily-report-employee-2026-08-07',
      classification: 'confidential',
    });
  });

  it('reports broken project, objective, KR, report, and attachment references', () => {
    const errors = validateRepositoryIntegrity({
      ...mockData,
      projects: [{ ...projects[0], memberIds: ['missing-user'] }, ...projects.slice(1)],
      objectives: [{ ...objectives[0], projectId: 'missing-project' }, ...objectives.slice(1)],
      keyResults: [{ ...keyResults[0], objectiveId: 'missing-objective' }, ...keyResults.slice(1)],
      dailyReports: [{ ...dailyReports[0], keyResultIds: ['missing-key-result'] }, ...dailyReports.slice(1)],
      attachments: [{ ...attachments[0], relatedResourceId: 'missing-report' }, ...attachments.slice(1)],
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        'Project project-orion references unknown member missing-user',
        'Objective objective-orion-activation references unknown project missing-project',
        'Key result kr-orion-activation references unknown objective missing-objective',
        'Daily report daily-report-leader-2026-08-07 references unknown key result missing-key-result',
        'Attachment attachment-public-orion-brief references unknown daily report missing-report',
      ]),
    );
  });

  it('has no referential integrity errors in the shipped mock fixture', () => {
    expect(validateRepositoryIntegrity(mockData)).toEqual([]);
  });

  it('reports a cross-project share whose collaboration direction is reversed', () => {
    const errors = validateRepositoryIntegrity({
      ...mockData,
      collaborationRelations: [
        {
          ...collaborationRelations[0],
          viewerId: 'user-project-peer',
          subjectUserId: 'user-employee',
        },
      ],
    });

    expect(errors).toContain(
      'Active share share-nova-report-to-orion lacks a matching collaboration relation from user-project-peer to user-employee',
    );
  });
});
