import type { Classification, DailyReport, KeyResult, Objective } from './types';
import type { RepositoryErrorCode } from '../data/types';
import { validateAttachment } from '../services/attachmentService';

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
  workDescription: string;
  hours: number;
  result: string;
  evidence: DailyEvidenceDraft[];
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
  uploadState?: 'selected' | 'pending' | 'uploading' | 'verifying' | 'uploaded' | 'failed' | 'deleting';
  uploadProgress?: number;
  errorCode?: RepositoryErrorCode;
  error?: string;
}

export function dailyEvidenceIsUploaded(item: DailyEvidenceDraft): boolean {
  return item.kind !== 'file' || (item.uploadState === 'uploaded' && Boolean(item.attachmentId));
}

export function dailyReportUploadsComplete(draft: DailyReportDraft): boolean {
  return draft.blocks.every((block) => block.evidence.every(dailyEvidenceIsUploaded));
}

export interface DailyReportDraft {
  blocks: DailyOkrBlockDraft[];
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

export interface DailyReportValidationOptions {
  allowLegacyLinkEvidence?: boolean;
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

function isClassification(value: Classification): boolean {
  return Object.hasOwn(classificationRank, value);
}

export function validateDailyReportDraft(draft: DailyReportDraft, options: DailyReportValidationOptions = {}): DailyReportValidationIssue[] {
  const issues: DailyReportValidationIssue[] = [];
  if (draft.blocks.length === 0) issues.push({ field: 'blocks', message: '请至少添加一组 Daily OKR' });

  draft.blocks.forEach((block, index) => {
    const field = `blocks.${index}`;
    if (!block.linkedKeyResultId) issues.push({ field: `${field}.linkedKeyResultId`, message: '请选择关联的季度 KR' });
    if (!block.dailyObjective.trim()) issues.push({ field: `${field}.dailyObjective`, message: '请填写当日 O' });
    if (!block.workDescription.trim()) issues.push({ field: `${field}.workDescription`, message: '请填写工作描述' });
    if (!block.result.trim()) issues.push({ field: `${field}.result`, message: '请填写结果或数据' });
    block.evidence.forEach((item, evidenceIndex) => {
      const evidenceField = `${field}.evidence.${evidenceIndex}`;
      if (!item.label.trim()) issues.push({ field: `${evidenceField}.label`, message: '请填写成果名称或链接说明' });
      if (!options.allowLegacyLinkEvidence && item.kind !== 'file') issues.push({ field: `${evidenceField}.kind`, message: '仅支持上传文件作为成果附件' });
      if (!isClassification(item.classification)) issues.push({ field: `${evidenceField}.classification`, message: '请选择有效的成果密级' });
      if (item.kind === 'file' && item.file) {
        const fileIssue = validateAttachment(item.file);
        if (fileIssue) issues.push({ field: `${evidenceField}.file`, message: fileIssue.message });
      } else if (item.kind === 'file' && !item.attachmentId) {
        issues.push({ field: `${evidenceField}.file`, message: '请选择有效的成果附件' });
      }
    });
    if (!isFiniteNonNegative(block.hours)) issues.push({ field: `${field}.hours`, message: '工时需填写有限且不小于 0 的数值' });
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
  validationOptions?: DailyReportValidationOptions,
): DailyReportConversionResult {
  const validationIssues = validateDailyReportDraft(draft, validationOptions);
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
      workDescription: block.workDescription,
      hours: block.hours,
      result: block.result,
      keyResults: [{ id: `${block.id}-work`, title: block.workDescription }],
      evidenceItems: block.evidence.map((item) => ({ ...item })),
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
      evidence: draft.blocks.flatMap((block) => block.evidence.map((item) => item.label)),
      evidenceItems: draft.blocks.flatMap((block) => block.evidence.map((item) => ({ ...item }))),
      evidenceClassification: draft.blocks.flatMap((block) => block.evidence).reduce<Classification>(mostRestrictiveClassification, 'public'),
      attachmentIds: draft.blocks.flatMap((block) => block.evidence.flatMap((item) => (
        item.kind === 'file' && item.attachmentId ? [item.attachmentId] : []
      ))),
      status: 'submitted',
    },
  };
}
