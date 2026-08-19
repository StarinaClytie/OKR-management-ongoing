import { isKrOwner } from './krAssignments';
import { deriveObjectiveProgress } from './okrMetrics';
import { resolveOkrStatus } from './okrStatus';
import type { KeyResult, KrAssignment, KrProgressUpdate, Objective, OkrStatus, User } from './types';

export interface ObjectiveSummary {
  objective: Objective;
  keyResults: KeyResult[];
  overallProgress: number;
  okrStatus: OkrStatus;
  updateCount: number;
}

export type ObjectiveFilter = 'all' | 'mine' | 'myKrs';

export function summarizeObjective(
  objective: Objective,
  keyResults: readonly KeyResult[],
  krProgressUpdates: readonly KrProgressUpdate[],
  evaluationDate: string,
): ObjectiveSummary {
  const objectiveKeyResults = keyResults.filter((keyResult) => keyResult.objectiveId === objective.id);
  const overallProgress = deriveObjectiveProgress(objectiveKeyResults);
  const okrStatus = resolveOkrStatus(objective.okrStatus, overallProgress, objective.startDate, objective.dueDate, evaluationDate);
  const krIds = new Set(objectiveKeyResults.map((keyResult) => keyResult.id));
  const updateCount = krProgressUpdates.filter((update) => krIds.has(update.krId)).length;

  return { objective, keyResults: objectiveKeyResults, overallProgress, okrStatus, updateCount };
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

  // myKrs: objectives that carry a KR the user owns.
  return summaries.filter((summary) => summary.keyResults.some(
    (keyResult) => isKrOwner(user.id, keyResult.id, krAssignments),
  ));
}
