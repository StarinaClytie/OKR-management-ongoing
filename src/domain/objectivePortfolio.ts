import { isKrCollaborator } from './krAssignments';
import { deriveObjectiveProgress } from './okrMetrics';
import { resolveOkrStatus } from './okrStatus';
import type { KeyResult, KrAssignment, KrProgressUpdate, Objective, OkrStatus, Risk, User } from './types';

export interface ObjectiveSummary {
  objective: Objective;
  keyResults: KeyResult[];
  overallProgress: number;
  okrStatus: OkrStatus;
  riskCount: number;
  updateCount: number;
}

export type ObjectiveFilter = 'all' | 'mine' | 'myKrs' | 'risk';

export function summarizeObjective(
  objective: Objective,
  keyResults: readonly KeyResult[],
  krProgressUpdates: readonly KrProgressUpdate[],
  risks: readonly Risk[],
  evaluationDate: string,
): ObjectiveSummary {
  const objectiveKeyResults = keyResults.filter((keyResult) => keyResult.objectiveId === objective.id);
  const overallProgress = deriveObjectiveProgress(objectiveKeyResults);
  const okrStatus = resolveOkrStatus(objective.okrStatus, overallProgress, objective.startDate, objective.dueDate, evaluationDate);
  const krIds = new Set(objectiveKeyResults.map((keyResult) => keyResult.id));
  const riskCount = risks.filter((risk) => !risk.resolved && (risk.objectiveId === objective.id || (risk.keyResultId !== undefined && krIds.has(risk.keyResultId)))).length;
  const updateCount = krProgressUpdates.filter((update) => krIds.has(update.krId)).length;

  return { objective, keyResults: objectiveKeyResults, overallProgress, okrStatus, riskCount, updateCount };
}

export function filterObjectiveSummaries(
  filter: ObjectiveFilter,
  summaries: readonly ObjectiveSummary[],
  user: User,
  krAssignments: readonly KrAssignment[],
): ObjectiveSummary[] {
  if (filter === 'all') return [...summaries];

  if (filter === 'mine') {
    if (user.role === 'management' || user.role === 'administrator') return [...summaries];
    return summaries.filter((summary) => summary.objective.ownerId === user.id);
  }

  if (filter === 'myKrs') {
    return summaries.filter((summary) => summary.keyResults.some(
      (keyResult) => keyResult.ownerId === user.id || isKrCollaborator(user.id, keyResult.id, krAssignments),
    ));
  }

  // risk: objectives that are at risk/delayed, or that carry any unresolved risk.
  return summaries.filter((summary) => (
    summary.okrStatus === 'at_risk' || summary.okrStatus === 'delayed' || summary.riskCount > 0
  ));
}
