import type { KeyResult, Objective, User } from './types';

/**
 * Lightweight, role-derived OKR permission helpers. These mirror the
 * organization-level rules documented for the OKR domain and reuse the existing
 * role model rather than introducing a competing permission system. Data-layer
 * enforcement for Supabase mode lives in RLS/RPC policies; these functions gate
 * the demo/UI layer and keep the same rules readable and unit-testable.
 */

const organizationalPlanners = new Set<User['role']>(['management', 'administrator']);

function isOrganizationalPlanner(user: User): boolean {
  return organizationalPlanners.has(user.role);
}

/** Whether the user leads (owns) the given objective. */
export function leadsObjective(user: User, objective: Pick<Objective, 'ownerId'>): boolean {
  return objective.ownerId === user.id;
}

/** Management/administrator create company Objectives. */
export function canCreateObjective(user: User): boolean {
  return isOrganizationalPlanner(user);
}

/** Management/administrator edit any objective; a project leader may edit their own. */
export function canEditObjective(user: User, objective: Pick<Objective, 'ownerId'>): boolean {
  return isOrganizationalPlanner(user) || leadsObjective(user, objective);
}

/** Only management/administrator archive or restore objectives. */
export function canArchiveObjective(user: User): boolean {
  return isOrganizationalPlanner(user);
}

/** Decompose/assign KRs inside an objective: management or the objective's leader. */
export function canManageKeyResults(user: User, objective: Pick<Objective, 'ownerId'>): boolean {
  return isOrganizationalPlanner(user) || leadsObjective(user, objective);
}

/** Assign KR owner/collaborators (a structural change, not an employee action). */
export function canAssignKeyResult(user: User, objective: Pick<Objective, 'ownerId'>): boolean {
  return canManageKeyResults(user, objective);
}

/**
 * Update a KR's progress. The KR owner may update their own; management and the
 * objective's leader may also record progress updates where appropriate.
 */
export function canUpdateKeyResultProgress(user: User, objective: Pick<Objective, 'ownerId'>, keyResult: Pick<KeyResult, 'ownerId'>): boolean {
  return isOrganizationalPlanner(user) || leadsObjective(user, objective) || keyResult.ownerId === user.id;
}

/**
 * Whether an employee may report (write a daily report) against a KR: they own
 * it or collaborate on it. `isCollaborator` is supplied by the caller from the
 * assignment set.
 */
export function canReportAgainstKeyResult(user: User, keyResult: Pick<KeyResult, 'ownerId'>, isCollaborator: boolean): boolean {
  return keyResult.ownerId === user.id || isCollaborator;
}
