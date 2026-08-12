import type { Classification, DailyReport, KeyResult, Objective } from './types';

export type DailyKrType = 'quantity' | 'ratio' | 'milestone' | 'subjective';

export interface DailyKeyResultDraft {
  id: string;
  title: string;
  type: DailyKrType;
  hours?: number;
  progress?: number;
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
  objectiveProgress?: number;
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

export interface DailyReportConversionContext {
  authorId: string;
  projectId: string;
  fallbackObjectiveId: string;
  date: string;
  submissionNonce?: number;
  objectives: ReadonlyArray<Pick<Objective, 'id' | 'projectId'>>;
  keyResults: ReadonlyArray<Pick<KeyResult, 'id' | 'objectiveId'>>;
}

export type DailyReportConversionErrorCode = 'INVALID_DRAFT' | 'OBJECTIVE_NOT_IN_PROJECT' | 'KEY_RESULT_NOT_IN_OBJECTIVE';

export interface DailyReportValidationIssue {
  field: string;
  message: string;
}

export type DailyReportConversionResult =
  | { ok: true; report: DailyReport }
  | { ok: false; error: { code: DailyReportConversionErrorCode; message: string } };

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
    formula: '自评分 × 100%',
    example: '自评 0.75 分时换算填写 75%',
    caution: '仅在难以量化时使用，并先写清可共同判断的验收标准。',
  },
};

const classificationRank: Record<Classification, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
};

export const validateProgress = (value: number | undefined): string | null => {
  if (value === undefined) return '请填写完成度';
  return Number.isFinite(value) && value >= 0 && value <= 100 ? null : '完成度需填写 0%～100%';
};

export function getKrAverageReference(krs: DailyKeyResultDraft[]): number | null {
  const enteredProgress = krs
    .map((kr) => kr.progress)
    .filter((progress): progress is number => validateProgress(progress) === null);
  if (enteredProgress.length === 0) return null;
  return Math.round(enteredProgress.reduce((sum, progress) => sum + progress, 0) / enteredProgress.length);
}

export function getKrGuidance(type: DailyKrType): DailyKrGuidance {
  return guidanceByType[type];
}

function isFiniteNonNegative(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}

function isMilestoneStatus(value: DailyKeyResultDraft['milestoneStatus']): boolean {
  return value === 'not_started' || value === 'in_progress' || value === 'completed';
}

function isEvidenceKind(value: DailyEvidenceDraft['kind']): boolean {
  return value === 'file' || value === 'link';
}

function isClassification(value: Classification): boolean {
  return Object.hasOwn(classificationRank, value);
}

function numericIssue(
  issues: DailyReportValidationIssue[],
  field: string,
  value: number | undefined,
  requiredMessage: string,
): void {
  if (value === undefined) {
    issues.push({ field, message: requiredMessage });
  } else if (!isFiniteNonNegative(value)) {
    issues.push({ field, message: `${requiredMessage.replace('请填写', '')}需填写有限且不小于 0 的数值` });
  }
}

export function validateDailyReportDraft(draft: DailyReportDraft): DailyReportValidationIssue[] {
  const issues: DailyReportValidationIssue[] = [];
  if (!draft.dailyObjective.trim()) issues.push({ field: 'dailyObjective', message: '请填写当日 O' });

  const objectiveProgressError = validateProgress(draft.objectiveProgress);
  if (objectiveProgressError) issues.push({ field: 'objectiveProgress', message: objectiveProgressError });
  if (draft.keyResults.length === 0) issues.push({ field: 'keyResults', message: '请至少添加一个当日 KR' });

  draft.keyResults.forEach((keyResult, index) => {
    const field = `keyResults.${index}`;
    if (!keyResult.title.trim()) issues.push({ field: `${field}.title`, message: '请填写 KR 内容' });
    if (!keyResult.workNote.trim()) issues.push({ field: `${field}.workNote`, message: '请填写 KR 工作说明' });
    if (!isFiniteNonNegative(keyResult.hours)) {
      issues.push({ field: `${field}.hours`, message: '工时需填写有限且不小于 0 的数值' });
    }
    const progressError = validateProgress(keyResult.progress);
    if (progressError) issues.push({ field: `${field}.progress`, message: progressError });

    if (keyResult.type === 'quantity') {
      numericIssue(issues, `${field}.targetValue`, keyResult.targetValue, '请填写数量型 KR 的目标值');
      numericIssue(issues, `${field}.actualValue`, keyResult.actualValue, '当前实际值');
    }
    if (keyResult.type === 'ratio') {
      numericIssue(issues, `${field}.baselineValue`, keyResult.baselineValue, '请填写比率型 KR 的起始值');
      numericIssue(issues, `${field}.targetValue`, keyResult.targetValue, '请填写比率型 KR 的目标值');
      numericIssue(issues, `${field}.actualValue`, keyResult.actualValue, '请填写比率型 KR 的当前值');
    }
    if (keyResult.type === 'milestone') {
      if (!keyResult.dueDate) issues.push({ field: `${field}.dueDate`, message: '请填写里程碑截止日期' });
      if (!isMilestoneStatus(keyResult.milestoneStatus)) {
        issues.push({ field: `${field}.milestoneStatus`, message: '请选择里程碑当前状态' });
      }
    }
    if (keyResult.type === 'subjective' && !keyResult.acceptanceCriteria?.trim()) {
      issues.push({ field: `${field}.acceptanceCriteria`, message: '请填写主观型 KR 的验收标准' });
    }
  });

  draft.evidence.forEach((item, index) => {
    const field = `evidence.${index}`;
    if (!item.label.trim()) issues.push({ field: `${field}.label`, message: '请填写成果名称或链接说明' });
    if (!isEvidenceKind(item.kind)) issues.push({ field: `${field}.kind`, message: '请选择成果类型' });
    if (!isClassification(item.classification)) issues.push({ field: `${field}.classification`, message: '请选择有效的成果密级' });
  });

  if (!isClassification(draft.classification)) issues.push({ field: 'classification', message: '请选择有效的日报密级' });
  return issues;
}

function mostRestrictiveClassification(current: Classification, item: DailyEvidenceDraft): Classification {
  return classificationRank[item.classification] > classificationRank[current]
    ? item.classification
    : current;
}

export function toLocalDailyReport(
  draft: DailyReportDraft,
  context: DailyReportConversionContext,
): DailyReportConversionResult {
  const objectiveId = draft.linkedObjectiveId ?? context.fallbackObjectiveId;
  const objective = context.objectives.find((item) => item.id === objectiveId);

  if (!objective || objective.projectId !== context.projectId) {
    return {
      ok: false,
      error: {
        code: 'OBJECTIVE_NOT_IN_PROJECT',
        message: '所关联的 O 不属于当前项目',
      },
    };
  }

  const hasKeyResultOutsideObjective = draft.keyResults.some((kr) => {
    if (!kr.linkedKeyResultId) return false;
    return context.keyResults.find((item) => item.id === kr.linkedKeyResultId)?.objectiveId !== objectiveId;
  });

  if (hasKeyResultOutsideObjective) {
    return {
      ok: false,
      error: {
        code: 'KEY_RESULT_NOT_IN_OBJECTIVE',
        message: '所关联的 KR 不属于最终 O',
      },
    };
  }

  const validationIssues = validateDailyReportDraft(draft);
  if (validationIssues.length > 0) {
    return {
      ok: false,
      error: {
        code: 'INVALID_DRAFT',
        message: validationIssues[0]!.message,
      },
    };
  }

  return { ok: true, report: {
    id: `local-${context.authorId}-${context.date}${context.submissionNonce === undefined ? '' : `-${context.submissionNonce}`}`,
    authorId: context.authorId,
    projectId: context.projectId,
    objectiveId,
    keyResultIds: draft.keyResults.flatMap((kr) => (kr.linkedKeyResultId ? [kr.linkedKeyResultId] : [])),
    date: context.date,
    content: draft.dailyObjective,
    dailyObjective: draft.dailyObjective,
    objectiveProgress: draft.objectiveProgress,
    dailyKeyResults: draft.keyResults.map((kr) => ({ ...kr })),
    classification: draft.classification,
    hours: draft.keyResults.reduce((sum, kr) => sum + (kr.hours ?? 0), 0),
    evidence: draft.evidence.map((item) => item.label),
    evidenceItems: draft.evidence.map((item) => ({ ...item })),
    evidenceClassification: draft.evidence.reduce<Classification>(mostRestrictiveClassification, 'public'),
    attachmentIds: [],
    status: 'submitted',
  } };
}
