import type { Classification, DailyReport, KeyResult, Objective } from './types';

/** A single 今日 KR inside a Daily OKR block. */
export interface DailyKrDraft {
  id: string;
  title: string;
}

/** One Daily OKR block: 今日 O + linked quarterly KR + hours + result + 今日 KRs. */
export interface DailyOkrBlockDraft {
  id: string;
  dailyObjective: string;
  linkedKeyResultId: string;
  hours: number;
  result: string;
  keyResults: DailyKrDraft[];
}

/**
 * Legacy draft shape retained for the immutable `DailyReport` aggregate type and
 * the pre-blocks daily-KR editor. New daily reports are authored as blocks.
 */
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
  file?: File;
  attachmentId?: string;
  uploadState?: 'selected' | 'pending' | 'uploading' | 'uploaded' | 'failed' | 'deleting';
  uploadProgress?: number;
  error?: string;
}

export interface DailyReportDraft {
  blocks: DailyOkrBlockDraft[];
  evidence: DailyEvidenceDraft[];
  classification: Classification;
}

export interface DailyReportConversionContext {
  authorId: string;
  date: string;
  submissionNonce?: number;
  keyResults: ReadonlyArray<Pick<KeyResult, 'id' | 'objectiveId'>>;
  objectives: ReadonlyArray<Pick<Objective, 'id' | 'projectId'>>;
}

export type DailyReportConversionErrorCode = 'INVALID_DRAFT' | 'KEY_RESULT_NOT_AVAILABLE';

export interface DailyReportValidationIssue {
  field: string;
  message: string;
}

export type DailyReportConversionResult =
  | { ok: true; report: DailyReport }
  | { ok: false; error: { code: DailyReportConversionErrorCode; message: string } };

const classificationRank: Record<Classification, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
};

function isFiniteNonNegative(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}

function isEvidenceKind(value: DailyEvidenceDraft['kind']): boolean {
  return value === 'file' || value === 'link';
}

function isClassification(value: Classification): boolean {
  return Object.hasOwn(classificationRank, value);
}

export function validateDailyReportDraft(draft: DailyReportDraft): DailyReportValidationIssue[] {
  const issues: DailyReportValidationIssue[] = [];
  if (draft.blocks.length === 0) issues.push({ field: 'blocks', message: '请至少添加一组 Daily OKR' });

  draft.blocks.forEach((block, index) => {
    const field = `blocks.${index}`;
    if (!block.dailyObjective.trim()) issues.push({ field: `${field}.dailyObjective`, message: '请填写当日 O' });
    if (!block.linkedKeyResultId) issues.push({ field: `${field}.linkedKeyResultId`, message: '请选择关联的季度 KR' });
    if (!isFiniteNonNegative(block.hours)) issues.push({ field: `${field}.hours`, message: '工时需填写有限且不小于 0 的数值' });
    if (block.keyResults.length === 0) issues.push({ field: `${field}.keyResults`, message: '请至少添加一个当日 KR' });
    block.keyResults.forEach((keyResult, krIndex) => {
      if (!keyResult.title.trim()) issues.push({ field: `${field}.keyResults.${krIndex}.title`, message: '请填写 KR 内容' });
    });
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
  const validationIssues = validateDailyReportDraft(draft);
  if (validationIssues.length > 0) {
    return { ok: false, error: { code: 'INVALID_DRAFT', message: validationIssues[0]!.message } };
  }

  const keyResultById = new Map(context.keyResults.map((keyResult) => [keyResult.id, keyResult]));
  const objectiveById = new Map(context.objectives.map((objective) => [objective.id, objective]));

  // Resolve every block's linked KR and the first block's header project/objective.
  const blocks = draft.blocks.map((block) => {
    const linkedKeyResult = keyResultById.get(block.linkedKeyResultId);
    if (!linkedKeyResult || !objectiveById.has(linkedKeyResult.objectiveId)) {
      return { block, linkedKeyResult: undefined, objective: undefined };
    }
    return { block, linkedKeyResult, objective: objectiveById.get(linkedKeyResult.objectiveId) };
  });

  const firstResolved = blocks[0];
  if (!firstResolved?.linkedKeyResult || !firstResolved.objective) {
    return { ok: false, error: { code: 'KEY_RESULT_NOT_AVAILABLE', message: '所关联的季度 KR 不可用' } };
  }

  const headerObjectiveId = firstResolved.objective.id;
  const headerProjectId = firstResolved.objective.projectId;

  const reportBlocks = draft.blocks.map((block, index) => {
    return {
      id: `block-${context.authorId}-${context.date}-${index + 1}`,
      dailyObjective: block.dailyObjective,
      keyResultId: block.linkedKeyResultId,
      hours: block.hours,
      result: block.result,
      keyResults: block.keyResults.map((keyResult) => ({ ...keyResult })),
    };
  });

  return {
    ok: true,
    report: {
      id: `local-${context.authorId}-${context.date}${context.submissionNonce === undefined ? '' : `-${context.submissionNonce}`}`,
      authorId: context.authorId,
      projectId: headerProjectId,
      objectiveId: headerObjectiveId,
      keyResultIds: draft.blocks.map((block) => block.linkedKeyResultId),
      date: context.date,
      content: draft.blocks[0]!.dailyObjective,
      dailyObjective: draft.blocks[0]!.dailyObjective,
      blocks: reportBlocks,
      classification: draft.classification,
      hours: draft.blocks.reduce((sum, block) => sum + block.hours, 0),
      evidence: draft.evidence.map((item) => item.label),
      evidenceItems: draft.evidence.map((item) => ({ ...item })),
      evidenceClassification: draft.evidence.reduce<Classification>(mostRestrictiveClassification, 'public'),
      attachmentIds: [],
      status: 'submitted',
    },
  };
}
