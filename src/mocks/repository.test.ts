import { describe, expect, it } from 'vitest';
import { collaborationRelations, activeShares, attachments } from './security';
import { organizationRelations, projectMemberships } from './users';
import { mockRepository } from './repository';

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
});
