import type { KrAssignment } from './types';

export function ownersOfKr(krId: string, assignments: readonly KrAssignment[]): string[] {
  return assignments
    .filter((assignment) => assignment.krId === krId && assignment.assignmentRole === 'owner')
    .map((assignment) => assignment.userId);
}

export function collaboratorsOfKr(krId: string, assignments: readonly KrAssignment[]): string[] {
  return assignments
    .filter((assignment) => assignment.krId === krId && assignment.assignmentRole === 'collaborator')
    .map((assignment) => assignment.userId);
}

export function isKrCollaborator(userId: string, krId: string, assignments: readonly KrAssignment[]): boolean {
  return assignments.some(
    (assignment) => assignment.krId === krId && assignment.userId === userId && assignment.assignmentRole === 'collaborator',
  );
}

/** Whether `userId` owns the KR (multi-owner). */
export function isKrOwner(userId: string, krId: string, assignments: readonly KrAssignment[]): boolean {
  return assignments.some(
    (assignment) => assignment.krId === krId && assignment.userId === userId && assignment.assignmentRole === 'owner',
  );
}
