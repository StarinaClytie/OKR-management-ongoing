import type { PermissionDataSource } from '../auth/permissionService';
import type { ProjectMembership } from '../domain/types';
import type { DashboardData } from './types';

/**
 * Derive the client permission evaluator's relationship dataset from a loaded
 * dashboard payload.
 *
 * The evaluator (`can()`) needs project membership roles that no resource
 * carries on itself. In Supabase mode those relationships already travel with
 * the dashboard payload — `projects.leaderId` and `projects.memberIds` are
 * selected alongside every project — but nothing used to feed them back into
 * the evaluator, so `hasProjectRole()` matched an empty array and every
 * project-scoped decision (member report review, member worklog hours, project
 * management) silently denied.
 *
 * RLS remains the authority: this only mirrors relationships the server already
 * chose to disclose, so it can never widen what the caller is allowed to see.
 */
export function buildPermissionSource(data: DashboardData): PermissionDataSource {
  const projectMemberships: ProjectMembership[] = [];

  for (const project of data.projects) {
    const assigned = new Set<string>();
    if (project.leaderId) {
      assigned.add(project.leaderId);
      projectMemberships.push({
        id: `${project.id}:${project.leaderId}`,
        projectId: project.id,
        userId: project.leaderId,
        membershipRole: 'leader',
      });
    }
    for (const memberId of project.memberIds ?? []) {
      if (!memberId || assigned.has(memberId)) continue;
      assigned.add(memberId);
      projectMemberships.push({
        id: `${project.id}:${memberId}`,
        projectId: project.id,
        userId: memberId,
        membershipRole: 'member',
      });
    }
  }

  return {
    projectMemberships,
    // Reporting lines, explicit shares, and cross-project collaboration grants
    // are enforced server-side only; the dashboard payload carries no client
    // mirror of them, so these stay empty rather than guessing.
    organizationRelations: [],
    activeShares: [],
    collaborationRelations: [],
    workloads: data.workloads,
    objectives: data.objectives,
  };
}
