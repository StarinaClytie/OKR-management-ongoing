import type { ProgressStatus } from './types';

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

const severityRank: Record<ProgressStatus, number> = { on_track: 0, at_risk: 1, off_track: 2, complete: 3 };

export function deriveProgressStatus(input: ProgressStatusInput): { status: ProgressStatus; reasons: StatusReason[] } {
  if (input.actualProgress === 100 || (input.explicitlyComplete && input.milestones.every((item) => item.isComplete))) {
    return { status: 'complete', reasons: [{ code: 'complete', severity: 'complete', actual: input.actualProgress }] };
  }

  const gap = input.actualProgress - input.plannedProgress;
  const reasons: StatusReason[] = [];
  if (gap < -25) reasons.push({ code: 'behind_plan', severity: 'off_track', actual: input.actualProgress, planned: input.plannedProgress, gap });
  else if (gap < -10) reasons.push({ code: 'behind_plan', severity: 'at_risk', actual: input.actualProgress, planned: input.plannedProgress, gap });

  for (const milestone of input.milestones) {
    if (!milestone.isComplete && milestone.dueDate < input.evaluationDate) {
      reasons.push({ code: 'overdue_milestone', severity: 'at_risk', dueDate: milestone.dueDate });
    }
  }
  if (input.dueDate < input.evaluationDate) {
    reasons.push({ code: 'overdue_due_date', severity: 'off_track', dueDate: input.dueDate });
  }
  const activeScores = input.risks.filter((risk) => !risk.resolved).map((risk) => risk.score);
  if (activeScores.includes(9)) reasons.push({ code: 'critical_risk', severity: 'off_track', score: 9 });
  else if (activeScores.some((score) => score >= 6)) reasons.push({ code: 'high_risk', severity: 'at_risk', score: 6 });

  const status = reasons.reduce<ProgressStatus>((current, reason) => (
    severityRank[reason.severity] > severityRank[current] ? reason.severity : current
  ), 'on_track');
  return { status, reasons };
}
