import type { OkrStatus } from './types';

export const okrStatuses: readonly OkrStatus[] = ['not_started', 'on_track', 'at_risk', 'delayed', 'completed'];

const statusRank: Record<OkrStatus, number> = {
  not_started: 0,
  completed: 0,
  on_track: 1,
  at_risk: 2,
  delayed: 3,
};

/**
 * Deterministic default status for an Objective/KR. This is deliberately simple:
 * past due and unfinished → delayed; no progress yet → not_started; fully done →
 * completed; otherwise on_track. "At risk" is reserved for manual escalation or
 * future rules (it is never guessed here).
 */
export function deriveOkrStatus(
  progress: number,
  startDate: string,
  dueDate: string,
  evaluationDate: string,
): OkrStatus {
  if (progress >= 100) return 'completed';
  if (dueDate && dueDate < evaluationDate) return 'delayed';
  if (startDate && startDate > evaluationDate) return 'not_started';
  if (progress <= 0 && (!startDate || startDate > evaluationDate)) return 'not_started';
  return 'on_track';
}

/** Resolve a stored status, falling back to the deterministic default. */
export function resolveOkrStatus(
  okrStatus: OkrStatus | undefined,
  progress: number,
  startDate: string,
  dueDate: string,
  evaluationDate: string,
): OkrStatus {
  return okrStatus ?? deriveOkrStatus(progress, startDate, dueDate, evaluationDate);
}

export function compareOkrStatus(left: OkrStatus, right: OkrStatus): number {
  return statusRank[left] - statusRank[right];
}
