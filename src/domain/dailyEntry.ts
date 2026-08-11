import type { Classification, DailyReport } from './types';

export type DailyKrType = 'quantity' | 'ratio' | 'milestone' | 'subjective';

export interface DailyKeyResultDraft {
  id: string;
  title: string;
  type: DailyKrType;
  hours: number;
  progress: number;
  workNote: string;
  targetValue?: number;
  actualValue?: number;
  baselineValue?: number;
  dueDate?: string;
  milestoneStatus?: 'not_started' | 'in_progress' | 'completed';
  acceptanceCriteria?: string;
  linkedKeyResultId?: string;
}

export interface DailyEvidenceDraft {
  id: string;
  label: string;
  kind: 'file' | 'link';
  classification: Classification;
}

export interface DailyReportDraft {
  dailyObjective: string;
  objectiveProgress: number;
  linkedObjectiveId?: string;
  keyResults: DailyKeyResultDraft[];
  evidence: DailyEvidenceDraft[];
  classification: Classification;
}

export interface DailyKrGuidance {
  label: string;
  formula: string;
  example: string;
  caution: string;
}

const guidanceByType: Record<DailyKrType, DailyKrGuidance> = {
  quantity: {
    label: '数量型',
    formula: '实际完成值 ÷ 目标值',
    example: '目标 20 条，完成 15 条，可填写 75%',
    caution: '完成度由员工依据实际完成值自行计算并填写。',
  },
  ratio: {
    label: '比率型',
    formula: '（当前值 − 起始值）÷（目标值 − 起始值）',
    example: '从 40% 提升至 70%，当前 55%，可自行计算后填写完成度。',
    caution: '请区分“提升”与“提升至”的基准差异。',
  },
  milestone: {
    label: '里程碑型',
    formula: '依据截止日期与当前状态自行判断',
    example: '完成可填写 100%，未完成可填写 0%',
    caution: '过程进度由员工结合实际情况自行评估。',
  },
  subjective: {
    label: '主观型',
    formula: '依据预先写明的验收标准自行判断',
    example: '先写清验收标准，再填写 0～100% 的自评完成度。',
    caution: '仅在难以量化时使用，并确保标准可共同判断。',
  },
};

const classificationRank: Record<Classification, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
};

export const validateProgress = (value: number): string | null =>
  Number.isFinite(value) && value >= 0 && value <= 100 ? null : '完成度需填写 0%～100%';

export function getKrAverageReference(krs: DailyKeyResultDraft[]): number | null {
  if (krs.length === 0) return null;
  return Math.round(krs.reduce((sum, kr) => sum + kr.progress, 0) / krs.length);
}

export function getKrGuidance(type: DailyKrType): DailyKrGuidance {
  return guidanceByType[type];
}

function mostRestrictiveClassification(current: Classification, item: DailyEvidenceDraft): Classification {
  return classificationRank[item.classification] > classificationRank[current]
    ? item.classification
    : current;
}

export function toLocalDailyReport(
  draft: DailyReportDraft,
  context: { authorId: string; projectId: string; fallbackObjectiveId: string; date: string },
): DailyReport {
  return {
    id: `local-${context.authorId}-${context.date}`,
    authorId: context.authorId,
    projectId: context.projectId,
    objectiveId: draft.linkedObjectiveId ?? context.fallbackObjectiveId,
    keyResultIds: draft.keyResults.flatMap((kr) => (kr.linkedKeyResultId ? [kr.linkedKeyResultId] : [])),
    date: context.date,
    content: draft.dailyObjective,
    dailyObjective: draft.dailyObjective,
    objectiveProgress: draft.objectiveProgress,
    dailyKeyResults: draft.keyResults,
    classification: draft.classification,
    hours: draft.keyResults.reduce((sum, kr) => sum + kr.hours, 0),
    evidence: draft.evidence.map((item) => item.label),
    evidenceClassification: draft.evidence.reduce<Classification>(mostRestrictiveClassification, 'public'),
    attachmentIds: [],
    status: 'submitted',
  };
}
