import type { KeyResult, Milestone, Objective, ProgressSnapshot, ProgressStatus, Risk } from './types';

export type StatusReason =
  | { code: 'behind_plan'; severity: 'at_risk' | 'off_track'; actual: number; planned: number; gap: number }
  | { code: 'overdue_milestone'; severity: 'at_risk'; dueDate: string }
  | { code: 'overdue_due_date'; severity: 'off_track'; dueDate: string }
  | { code: 'high_risk'; severity: 'at_risk'; score: 6 }
  | { code: 'critical_risk'; severity: 'off_track'; score: 9 }
  | { code: 'complete'; severity: 'complete'; actual: number };

export interface ProgressStatusInput {
  actualProgress: number;
  plannedProgress: number;
  evaluationDate: string;
  dueDate: string;
  explicitlyComplete?: boolean;
  milestones: Array<{ dueDate: string; isComplete: boolean }>;
  risks: Array<{ score: number; resolved: boolean }>;
}

export interface ExecutionStatusData {
  keyResults: readonly KeyResult[];
  objectives: readonly Objective[];
  milestones: readonly Milestone[];
  risks: readonly Risk[];
  progressSnapshots: readonly ProgressSnapshot[];
}

export type ProgressStatusResult = { status: ProgressStatus; reasons: StatusReason[] };

export interface ExecutionStatusIndex {
  keyResults: ReadonlyMap<string, ProgressStatusResult>;
  objectives: ReadonlyMap<string, ProgressStatusResult>;
}

const severityRank: Record<ProgressStatus, number> = { on_track: 0, complete: 0, at_risk: 1, off_track: 2 };

export function deriveProgressStatus(input: ProgressStatusInput): ProgressStatusResult {
  const isComplete = input.actualProgress === 100
    || Boolean(input.explicitlyComplete && input.milestones.every((item) => item.isComplete));
  const gap = input.actualProgress - input.plannedProgress;
  const reasons: StatusReason[] = [];
  if (gap < -25) reasons.push({ code: 'behind_plan', severity: 'off_track', actual: input.actualProgress, planned: input.plannedProgress, gap });
  else if (gap < -10) reasons.push({ code: 'behind_plan', severity: 'at_risk', actual: input.actualProgress, planned: input.plannedProgress, gap });

  for (const milestone of input.milestones) {
    if (!milestone.isComplete && milestone.dueDate < input.evaluationDate) {
      reasons.push({ code: 'overdue_milestone', severity: 'at_risk', dueDate: milestone.dueDate });
    }
  }
  if (!isComplete && input.dueDate < input.evaluationDate) {
    reasons.push({ code: 'overdue_due_date', severity: 'off_track', dueDate: input.dueDate });
  }
  const activeScores = input.risks.filter((risk) => !risk.resolved).map((risk) => risk.score);
  if (activeScores.includes(9)) reasons.push({ code: 'critical_risk', severity: 'off_track', score: 9 });
  else if (activeScores.some((score) => score >= 6)) reasons.push({ code: 'high_risk', severity: 'at_risk', score: 6 });

  if (isComplete) reasons.push({ code: 'complete', severity: 'complete', actual: input.actualProgress });

  const escalatedStatus = reasons.reduce<ProgressStatus>((current, reason) => (
    severityRank[reason.severity] > severityRank[current] ? reason.severity : current
  ), 'on_track');
  const status = escalatedStatus === 'on_track' && isComplete ? 'complete' : escalatedStatus;
  return { status, reasons };
}

export function currentBusinessDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function plannedProgressForKeyResult(data: ExecutionStatusData, keyResult: KeyResult, evaluationDate: string): number {
  const latestPlan = data.progressSnapshots
    .filter((snapshot) => snapshot.keyResultId === keyResult.id && snapshot.weekOf <= evaluationDate)
    .filter((snapshot) => snapshot.actual === undefined || snapshot.planned !== 0)
    .sort((left, right) => left.weekOf.localeCompare(right.weekOf))
    .at(-1);
  return latestPlan?.planned ?? keyResult.progress;
}

export function deriveKeyResultExecutionStatus(
  data: ExecutionStatusData,
  keyResult: KeyResult,
  evaluationDate = currentBusinessDate(),
): ProgressStatusResult {
  return deriveProgressStatus({
    actualProgress: keyResult.progress,
    plannedProgress: plannedProgressForKeyResult(data, keyResult, evaluationDate),
    evaluationDate,
    dueDate: keyResult.dueDate,
    explicitlyComplete: keyResult.status === 'complete',
    milestones: data.milestones
      .filter((milestone) => milestone.dependencyIds.includes(keyResult.id))
      .map((milestone) => ({ dueDate: milestone.dueDate, isComplete: milestone.status === 'complete' })),
    risks: data.risks
      .filter((risk) => risk.keyResultId === keyResult.id)
      .map((risk) => ({ score: risk.probability * risk.impact, resolved: risk.resolved })),
  });
}

export function deriveObjectiveExecutionStatus(
  data: ExecutionStatusData,
  objective: Objective,
  evaluationDate = currentBusinessDate(),
): ProgressStatusResult {
  return deriveProgressStatus({
    actualProgress: objective.progress,
    plannedProgress: objective.progress,
    evaluationDate,
    dueDate: objective.dueDate,
    explicitlyComplete: objective.status === 'complete',
    milestones: data.milestones
      .filter((milestone) => milestone.objectiveId === objective.id)
      .map((milestone) => ({ dueDate: milestone.dueDate, isComplete: milestone.status === 'complete' })),
    risks: data.risks
      .filter((risk) => risk.objectiveId === objective.id)
      .map((risk) => ({ score: risk.probability * risk.impact, resolved: risk.resolved })),
  });
}

export function deriveExecutionStatuses(
  data: ExecutionStatusData,
  evaluationDate = currentBusinessDate(),
): ExecutionStatusIndex {
  return {
    keyResults: new Map(data.keyResults.map((keyResult) => [
      keyResult.id,
      deriveKeyResultExecutionStatus(data, keyResult, evaluationDate),
    ])),
    objectives: new Map(data.objectives.map((objective) => [
      objective.id,
      deriveObjectiveExecutionStatus(data, objective, evaluationDate),
    ])),
  };
}
