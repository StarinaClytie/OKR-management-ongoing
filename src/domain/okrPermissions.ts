import type { KeyResult, KrAssignment, Objective, ObjectiveOwner, User } from './types';

/**
 * Role-derived OKR permission helpers matching the layered business model:
 *   * Management alone creates and edits quarterly Objectives.
 *   * A Project Leader (Objective owner) decomposes/edit KRs and assigns owners.
 *   * KR owners (project leaders or employees) update progress and write daily
 *     reports against their assigned KRs.
 *
 * Data-layer enforcement for Supabase mode lives in RLS/RPC policies; these
 * functions gate the demo/UI layer and keep the same rules readable and
 * unit-testable.
 */

/** Management creates company/project Objectives. Administrator is system-only. */
export function canCreateObjective(user: User): boolean {
  return user.role === 'management';
}

/** Whether the user leads (owns) the given objective. */
export function leadsObjective(user: User, objective: Pick<Objective, 'ownerId'>): boolean {
  return objective.ownerId === user.id;
}

/** Whether `userId` is an assigned HR owner of the given objective. */
export function isHrObjectiveOwner(userId: string, objectiveId: string, objectiveOwners: readonly ObjectiveOwner[]): boolean {
  return objectiveOwners.some(
    (owner) => owner.objectiveId === objectiveId && owner.userId === userId && owner.roleType === 'hr',
  );
}

/** Management edits an Objective's definition; a Project Leader never can. */
export function canEditObjective(user: User, _objective: Pick<Objective, 'ownerId'>): boolean {
  return user.role === 'management';
}

/** Only management archives or restores objectives. */
export function canArchiveObjective(user: User): boolean {
  return user.role === 'management';
}

/**
 * Decompose/edit KRs inside an objective: the objective's project leader, or
 * (for HR Objectives) an assigned HR owner. Business Objectives stay
 * project-leader-only.
 */
export function canManageKeyResults(
  user: User,
  objective: Pick<Objective, 'id' | 'ownerId' | 'objectiveType'>,
  objectiveOwners: readonly ObjectiveOwner[] = [],
): boolean {
  if (user.role === 'project_leader') return leadsObjective(user, objective);
  if (user.role === 'hr' && objective.objectiveType === 'hr') {
    return isHrObjectiveOwner(user.id, objective.id, objectiveOwners);
  }
  return false;
}

/** Assign KR owners (a structural change, not an employee action). */
export function canAssignKeyResult(
  user: User,
  objective: Pick<Objective, 'id' | 'ownerId' | 'objectiveType'>,
  objectiveOwners: readonly ObjectiveOwner[] = [],
): boolean {
  return canManageKeyResults(user, objective, objectiveOwners);
}

/**
 * Whether `user` is a KR owner (via the multi-owner assignment set), independent
 * of the canonical `key_results.owner_id`.
 */
export function isKeyResultOwner(userId: string, krId: string, assignments: readonly KrAssignment[]): boolean {
  return assignments.some(
    (assignment) => assignment.krId === krId && assignment.userId === userId && assignment.assignmentRole === 'owner',
  );
}

/**
 * Update a KR's progress. The objective's project leader or any KR owner may
 * record progress updates.
 */
export function canUpdateKeyResultProgress(
  user: User,
  objective: Pick<Objective, 'ownerId'>,
  keyResult: Pick<KeyResult, 'id' | 'ownerId'>,
  assignments: readonly KrAssignment[],
): boolean {
  return leadsObjective(user, objective) || isKeyResultOwner(user.id, keyResult.id, assignments);
}

/**
 * Whether an employee may write a daily report against a KR: they own it
 * (multi-owner). `assignments` is the KR assignment set.
 */
export function canReportAgainstKeyResult(user: User, keyResult: Pick<KeyResult, 'ownerId' | 'id'>, assignments: readonly KrAssignment[]): boolean {
  return isKeyResultOwner(user.id, keyResult.id, assignments);
}
