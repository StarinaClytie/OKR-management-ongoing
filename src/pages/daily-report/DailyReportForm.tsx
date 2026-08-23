import { useMemo, useRef, useState } from 'react';
import { dailyReportUploadsComplete, validateDailyReportDraft, type DailyEvidenceDraft, type DailyOkrBlockDraft, type DailyReportDraft } from '../../domain/dailyEntry';
import type { Classification, KeyResult, Objective } from '../../domain/types';
import { DailyReportEvidence } from './DailyReportEvidence';
import { useLocale, type LocaleContextValue } from '../../i18n/LocaleProvider';
import type { LocalizedMessage, MessageKey } from '../../i18n/messages';
import type { DailyReportUploadSession, OkrRepository } from '../../data/types';
import { allowedClassifications } from '../../domain/dailyReportPolicy';

export type DailyReportSubmitResult =
  | { ok: true }
  | { ok: false; error: LocalizedMessage };

interface DailyReportFormProps {
  mode?: 'create' | 'edit';
  initialDraft?: DailyReportDraft;
  ownedKeyResults: readonly KeyResult[];
  objectives: readonly Objective[];
  onCancel: () => void;
  onSubmit: (draft: DailyReportDraft, uploadSession?: DailyReportUploadSession) => DailyReportSubmitResult | Promise<DailyReportSubmitResult>;
  onDownloadAttachment?: (attachmentId: string) => void | Promise<void>;
  onRemoveAttachment?: (attachmentId: string, options?: { preserveRevisionHistory?: boolean }) => boolean | Promise<boolean>;
  clearance?: Classification;
  reportDate?: string;
  uploadSession?: DailyReportUploadSession;
  uploadRepository?: Required<Pick<OkrRepository, 'beginDailyReportUploadSession' | 'uploadDailyReportAttachment' | 'abandonDailyReportUploadSession' | 'submitDailyReportSession'>>;
}

function cloneDraft(draft: DailyReportDraft): DailyReportDraft {
  return {
    ...draft,
    blocks: draft.blocks.map((block) => ({
      ...block,
      evidence: block.evidence.map((item) => ({
        ...item,
        uploadState: item.kind === 'file' && item.attachmentId ? item.uploadState ?? 'uploaded' : item.uploadState,
        uploadProgress: item.kind === 'file' && item.attachmentId ? item.uploadProgress ?? 100 : item.uploadProgress,
      })),
    })),
  };
}

const validationKeys: Record<string, MessageKey> = {
  '请至少添加一组 Daily OKR': 'validation.blockRequired',
  '请填写当日 O': 'validation.objectiveRequired',
  '请选择关联的季度 KR': 'validation.linkedKrRequired',
  '工时需填写有限且不小于 0 的数值': 'validation.hoursInvalid',
  '请至少添加一个当日 KR': 'validation.krRequired',
  '请填写 KR 内容': 'validation.krContentRequired',
  '请填写工作描述': 'validation.workDescriptionRequired',
  '请填写结果或数据': 'validation.resultRequired',
  '请填写成果名称或链接说明': 'validation.evidenceName',
  '仅支持上传文件作为成果附件': 'validation.evidenceFile',
  '请选择有效的成果密级': 'validation.evidenceClassification',
  '请选择有效的成果附件': 'validation.attachmentRequired',
  '文件不能为空': 'validation.attachmentEmpty',
  '文件不能超过 10 MB': 'validation.attachmentTooLarge',
  '不支持此文件类型': 'validation.attachmentUnsupported',
  '文件扩展名与内容类型不一致': 'validation.attachmentTypeMismatch',
  '请选择有效的日报密级': 'validation.reportClassification',
};

function localizeValidation(message: string | null, t: LocaleContextValue['t']): string | null {
  if (!message) return null;
  const key = validationKeys[message];
  return key ? t(key) : t('common.requestFailed');
}

function newBlock(id: string, linkedKeyResultId = ''): DailyOkrBlockDraft {
  return {
    id,
    dailyObjective: '',
    linkedKeyResultId,
    workDescription: '',
    hours: 0,
    result: '',
    evidence: [],
  };
}

export function DailyReportForm({ mode = 'create', initialDraft, ownedKeyResults, objectives, onCancel, onSubmit, onDownloadAttachment, onRemoveAttachment, clearance = 'restricted', reportDate, uploadSession, uploadRepository }: DailyReportFormProps) {
  const { t } = useLocale();
  const [draft, setDraft] = useState<DailyReportDraft>(() => initialDraft
    ? cloneDraft(initialDraft)
    : { blocks: [newBlock('block-1')], classification: 'internal' });
  const [showSubmitErrors, setShowSubmitErrors] = useState(false);
  const [status, setStatus] = useState<LocalizedMessage | null>(null);
  const [activeMutations, setActiveMutations] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nextBlockId = useRef(initialDraft?.blocks.length ?? 1);
  const fieldRefs = useRef(new Map<string, HTMLElement>());
  const uploadSessionRef = useRef<DailyReportUploadSession | undefined>(uploadSession);
  const uploadSessionPromiseRef = useRef<Promise<DailyReportUploadSession | undefined> | undefined>(undefined);
  const uploadControllersRef = useRef(new Map<string, AbortController>());
  const uploadPromisesRef = useRef(new Map<string, Promise<void>>());
  const removingEvidenceIdsRef = useRef(new Set<string>());
  const finalizedAttachmentIdsRef = useRef(new Map<string, string>());
  const validationOptions = useMemo(() => ({ allowLegacyLinkEvidence: mode === 'edit' }), [mode]);

  const validationErrors = useMemo(() => showSubmitErrors
    ? Object.fromEntries(validateDailyReportDraft(draft, validationOptions).map((issue) => [issue.field, localizeValidation(issue.message, t)!])) as Record<string, string>
    : {}, [draft, showSubmitErrors, t, validationOptions]);

  const objectiveById = useMemo(() => new Map(objectives.map((objective) => [objective.id, objective])), [objectives]);

  const totalHours = draft.blocks.reduce((sum, block) => sum + (Number.isFinite(block.hours) ? block.hours : 0), 0);

  const patchEvidence = (blockId: string, evidenceId: string, patch: Partial<DailyEvidenceDraft>) => {
    setDraft((current) => ({
      ...current,
      blocks: current.blocks.map((block) => block.id === blockId ? {
        ...block,
        evidence: block.evidence.map((item) => item.id === evidenceId ? { ...item, ...patch } : item),
      } : block),
    }));
  };

  const ensureUploadSession = async (): Promise<DailyReportUploadSession | undefined> => {
    if (uploadSessionRef.current) return uploadSessionRef.current;
    if (!uploadRepository || !reportDate) return undefined;
    if (!uploadSessionPromiseRef.current) {
      uploadSessionPromiseRef.current = uploadRepository.beginDailyReportUploadSession({ reportDate, status: 'submitted', classification: draft.classification }).then((result) => {
        if (!result.ok) return undefined;
        uploadSessionRef.current = result.data;
        return result.data;
      }).finally(() => { uploadSessionPromiseRef.current = undefined; });
    }
    return uploadSessionPromiseRef.current;
  };

  const uploadEvidence = (blockId: string, entryPosition: number, item: DailyEvidenceDraft) => {
    if (!uploadRepository || !item.file) return;
    const task = (async () => {
      setActiveMutations((count) => count + 1);
      const session = await ensureUploadSession();
      if (!session) {
        patchEvidence(blockId, item.id, { uploadState: 'failed', uploadProgress: 0, error: 'Upload session unavailable' });
        return;
      }
      if (removingEvidenceIdsRef.current.has(item.id)) return;
      const controller = new AbortController();
      uploadControllersRef.current.set(item.id, controller);
      const result = await uploadRepository.uploadDailyReportAttachment({
        session,
        file: item.file!,
        classification: item.classification,
        entryPosition,
        label: item.label,
        signal: controller.signal,
        onChange: (update) => patchEvidence(blockId, item.id, {
          uploadState: update.state,
          uploadProgress: update.progress,
          attachmentId: update.attachmentId,
          error: update.error,
          ...(update.state === 'uploaded' ? { file: undefined } : {}),
        }),
      });
      if (result.ok) finalizedAttachmentIdsRef.current.set(item.id, result.data.attachmentId);
      else patchEvidence(blockId, item.id, { uploadState: 'failed', error: result.error.message });
      uploadControllersRef.current.delete(item.id);
    })().finally(() => {
      setActiveMutations((count) => Math.max(0, count - 1));
      uploadPromisesRef.current.delete(item.id);
    });
    uploadPromisesRef.current.set(item.id, task);
  };

  const updateBlock = (id: string, patch: Partial<DailyOkrBlockDraft>) => {
    setDraft((current) => ({ ...current, blocks: current.blocks.map((block) => block.id === id ? { ...block, ...patch } : block) }));
  };

  const registerField = (field: string, element: HTMLElement | null) => {
    if (element) fieldRefs.current.set(field, element);
    else fieldRefs.current.delete(field);
  };

  const addBlock = () => {
    nextBlockId.current += 1;
    const id = `block-${nextBlockId.current}`;
    setDraft((current) => ({ ...current, blocks: [...current.blocks, newBlock(id)] }));
  };

  const lastBlockComplete = validateDailyReportDraft({ blocks: [draft.blocks[draft.blocks.length - 1]!], classification: draft.classification }, validationOptions).length === 0;

  const submit = async () => {
    if (isSubmitting || activeMutations > 0 || !dailyReportUploadsComplete(draft) || !evidenceWithinClearance) return;
    setShowSubmitErrors(true);
    const issues = validateDailyReportDraft(draft, validationOptions);
    if (issues.length > 0) {
      setStatus({ key: 'daily.fixRequired' });
      const firstIssue = issues[0]!;
      const control = fieldRefs.current.get(firstIssue.field);
      control?.focus();
      control?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      return;
    }
    setIsSubmitting(true);
    const session = uploadRepository && reportDate ? await ensureUploadSession() : uploadSessionRef.current;
    if (uploadRepository && reportDate && !session) {
      setIsSubmitting(false);
      setStatus({ key: 'common.requestFailed' });
      return;
    }
    const result = session ? await onSubmit(draft, session) : await onSubmit(draft);
    setIsSubmitting(false);
    setStatus(result.ok ? { key: mode === 'edit' ? 'daily.editSaved' : 'daily.submitted' } : result.error);
  };

  const cancel = async () => {
    if (activeMutations > 0 || isSubmitting) return;
    setActiveMutations((count) => count + 1);
    const session = uploadSessionRef.current;
    if (session && uploadRepository) await uploadRepository.abandonDailyReportUploadSession(session.sessionId);
    setActiveMutations((count) => Math.max(0, count - 1));
    onCancel();
  };

  const removeEvidence = async (blockId: string, item: DailyEvidenceDraft): Promise<boolean> => {
    removingEvidenceIdsRef.current.add(item.id);
    setActiveMutations((count) => count + 1);
    patchEvidence(blockId, item.id, { uploadState: 'deleting' });
    let removed = false;
    try {
      uploadControllersRef.current.get(item.id)?.abort();
      const upload = uploadPromisesRef.current.get(item.id);
      if (upload) await upload;
      const attachmentId = item.attachmentId ?? finalizedAttachmentIdsRef.current.get(item.id);
      const isSessionAttachment = finalizedAttachmentIdsRef.current.has(item.id);
      removed = attachmentId && onRemoveAttachment
        ? isSessionAttachment
          ? await onRemoveAttachment(attachmentId, { preserveRevisionHistory: false })
          : await onRemoveAttachment(attachmentId)
        : true;
      if (!removed) patchEvidence(blockId, item.id, { uploadState: item.uploadState, uploadProgress: item.uploadProgress });
      return removed;
    } finally {
      if (removed) finalizedAttachmentIdsRef.current.delete(item.id);
      removingEvidenceIdsRef.current.delete(item.id);
      setActiveMutations((count) => Math.max(0, count - 1));
    }
  };

  const removeBlock = async (id: string) => {
    if (draft.blocks.length === 1 || activeMutations > 0 || isSubmitting) return;
    const block = draft.blocks.find((candidate) => candidate.id === id);
    if (!block) return;
    for (const item of block.evidence) {
      if (!await removeEvidence(block.id, item)) return;
    }
    setDraft((current) => ({ ...current, blocks: current.blocks.filter((candidate) => candidate.id !== id) }));
  };

  const formIsValid = validateDailyReportDraft(draft, validationOptions).length === 0;
  const allowedEvidenceClassifications = allowedClassifications(clearance);
  const evidenceWithinClearance = draft.blocks.every((block) => block.evidence.every((item) => allowedEvidenceClassifications.includes(item.classification)));
  const submitDisabled = !formIsValid || !dailyReportUploadsComplete(draft) || !evidenceWithinClearance || activeMutations > 0 || isSubmitting;

  return (
    <form className="daily-entry-layout" noValidate onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <div className="daily-entry-form">
        {draft.blocks.map((block, index) => {
          const prefix = `blocks.${index}`;
          const hoursValue = block.hours === 0 ? '' : String(block.hours);
          const errorFor = (field: keyof Omit<DailyOkrBlockDraft, 'id' | 'evidence'>) => validationErrors[`${prefix}.${field}`];
          const errorId = (field: keyof Omit<DailyOkrBlockDraft, 'id' | 'evidence'>) => `${block.id}-${field}-error`;
          return (
            <section key={block.id} className="form-card form-section daily-okr-block" aria-labelledby={`${block.id}-heading`}>
              <div className="daily-evidence__header">
                <h2 id={`${block.id}-heading`}>{t('daily.blockHeading', { number: index + 1 })}</h2>
                {draft.blocks.length > 1 ? (
                  <button type="button" className="button button--secondary" onClick={() => void removeBlock(block.id)}>{t('daily.removeBlock')}</button>
                ) : null}
              </div>

              <label className="modal-field">
                <span>{t('daily.linkedQuarterlyKr')} *</span>
                <select
                  id={`${block.id}-linked-key-result`}
                  ref={(element) => registerField(`${prefix}.linkedKeyResultId`, element)}
                  value={block.linkedKeyResultId}
                  aria-invalid={Boolean(errorFor('linkedKeyResultId'))}
                  aria-describedby={errorFor('linkedKeyResultId') ? errorId('linkedKeyResultId') : undefined}
                  onChange={(event) => updateBlock(block.id, { linkedKeyResultId: event.target.value })}
                >
                  <option value="">{t('daily.select')}</option>
                  {ownedKeyResults.map((keyResult) => {
                    const objective = objectiveById.get(keyResult.objectiveId);
                    return (
                      <option key={keyResult.id} value={keyResult.id}>
                        {objective ? `${objective.title} / ` : ''}{keyResult.title}
                      </option>
                    );
                  })}
                </select>
                {errorFor('linkedKeyResultId') && <span id={errorId('linkedKeyResultId')} role="alert" className="field-error">{errorFor('linkedKeyResultId')}</span>}
              </label>

              <label className="modal-field">
                <span>{t('daily.objective')} *</span>
                <input
                  id={`${block.id}-daily-objective`}
                  ref={(element) => registerField(`${prefix}.dailyObjective`, element)}
                  value={block.dailyObjective}
                  aria-invalid={Boolean(errorFor('dailyObjective'))}
                  aria-describedby={errorFor('dailyObjective') ? errorId('dailyObjective') : undefined}
                  onChange={(event) => updateBlock(block.id, { dailyObjective: event.target.value })}
                  placeholder={t('daily.objectivePlaceholder')}
                />
                {errorFor('dailyObjective') && <span id={errorId('dailyObjective')} role="alert" className="field-error">{errorFor('dailyObjective')}</span>}
              </label>

              {block.linkedKeyResultId ? <p className="modal-field"><span>{t('alignment.companyO')}</span><strong>{objectiveById.get(ownedKeyResults.find((keyResult) => keyResult.id === block.linkedKeyResultId)?.objectiveId ?? '')?.title ?? '—'}</strong></p> : null}

              <label className="modal-field">
                <span>{t('daily.workDescription')} *</span>
                <textarea id={`${block.id}-work-description`} ref={(element) => registerField(`${prefix}.workDescription`, element)} value={block.workDescription} aria-invalid={Boolean(errorFor('workDescription'))} aria-describedby={errorFor('workDescription') ? errorId('workDescription') : undefined} onChange={(event) => updateBlock(block.id, { workDescription: event.target.value })} rows={3} />
                {errorFor('workDescription') && <span id={errorId('workDescription')} role="alert" className="field-error">{errorFor('workDescription')}</span>}
              </label>

              <label className="modal-field">
                <span>{t('daily.result')} *</span>
                <textarea id={`${block.id}-result`} ref={(element) => registerField(`${prefix}.result`, element)} value={block.result} aria-invalid={Boolean(errorFor('result'))} aria-describedby={errorFor('result') ? errorId('result') : undefined} onChange={(event) => updateBlock(block.id, { result: event.target.value })} rows={2} />
                {errorFor('result') && <span id={errorId('result')} role="alert" className="field-error">{errorFor('result')}</span>}
              </label>

              <DailyReportEvidence
                evidence={block.evidence}
                idPrefix={block.id}
                errorPrefix={`${prefix}.`}
                onEvidenceChange={(update) => setDraft((current) => ({
                  ...current,
                  blocks: current.blocks.map((candidate) => candidate.id === block.id ? {
                    ...candidate,
                    evidence: typeof update === 'function' ? update(candidate.evidence) : update,
                  } : candidate),
                }))}
                errors={validationErrors}
                onFieldRef={registerField}
                onDownloadAttachment={onDownloadAttachment}
                onRemoveAttachment={onRemoveAttachment}
                onRemoveEvidence={(item) => removeEvidence(block.id, item)}
                clearance={clearance}
                onUploadRequested={(item) => uploadEvidence(block.id, index + 1, item)}
                onRetryRequested={(itemId) => {
                  const item = draft.blocks.find((candidate) => candidate.id === block.id)?.evidence.find((candidate) => candidate.id === itemId);
                  if (item?.file) uploadEvidence(block.id, index + 1, item);
                }}
              />

              <label className="modal-field">
                <span>{t('daily.blockHours')} *</span>
                <input
                  id={`${block.id}-hours`}
                  ref={(element) => registerField(`${prefix}.hours`, element)}
                  type="number"
                  min="0"
                  step="0.5"
                  inputMode="decimal"
                  value={hoursValue}
                  aria-invalid={Boolean(errorFor('hours'))}
                  aria-describedby={errorFor('hours') ? errorId('hours') : undefined}
                  onChange={(event) => updateBlock(block.id, { hours: event.target.value === '' ? 0 : Number(event.target.value) })}
                />
                {errorFor('hours') && <span id={errorId('hours')} role="alert" className="field-error">{errorFor('hours')}</span>}
              </label>

            </section>
          );
        })}

        {lastBlockComplete ? <button type="button" className="button button--secondary" onClick={addBlock}>{t('daily.addBlock')}</button> : null}

        <p className="daily-total-hours">{t('daily.totalHours', { count: totalHours })}</p>

        <div className="daily-form-actions">
          <button type="button" className="button button--secondary" disabled={activeMutations > 0 || isSubmitting} onClick={() => void cancel()}>{t('common.cancel')}</button>
          <button type="submit" className="button button--primary" disabled={submitDisabled}>{mode === 'edit' ? t('daily.saveChanges') : t('daily.submit')}</button>
        </div>
        {status && <p className="page-notice" role="status">{t(status.key, status.values)}</p>}
      </div>
    </form>
  );
}
