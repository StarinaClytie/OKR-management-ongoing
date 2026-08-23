import { useMemo, useRef, useState } from 'react';
import { validateDailyReportDraft, type DailyOkrBlockDraft, type DailyReportDraft } from '../../domain/dailyEntry';
import type { KeyResult, Objective } from '../../domain/types';
import { DailyReportEvidence } from './DailyReportEvidence';
import { useLocale, type LocaleContextValue } from '../../i18n/LocaleProvider';
import type { LocalizedMessage, MessageKey } from '../../i18n/messages';

export type DailyReportSubmitResult =
  | { ok: true }
  | { ok: false; error: LocalizedMessage };

interface DailyReportFormProps {
  mode?: 'create' | 'edit';
  initialDraft?: DailyReportDraft;
  ownedKeyResults: readonly KeyResult[];
  objectives: readonly Objective[];
  onCancel: () => void;
  onSubmit: (draft: DailyReportDraft) => DailyReportSubmitResult | Promise<DailyReportSubmitResult>;
  onDownloadAttachment?: (attachmentId: string) => void | Promise<void>;
  onRemoveAttachment?: (attachmentId: string) => boolean | Promise<boolean>;
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

export function DailyReportForm({ mode = 'create', initialDraft, ownedKeyResults, objectives, onCancel, onSubmit, onDownloadAttachment, onRemoveAttachment }: DailyReportFormProps) {
  const { t } = useLocale();
  const [draft, setDraft] = useState<DailyReportDraft>(() => initialDraft
    ? structuredClone(initialDraft)
    : { blocks: [newBlock('block-1')], classification: 'internal' });
  const [showSubmitErrors, setShowSubmitErrors] = useState(false);
  const [status, setStatus] = useState<LocalizedMessage | null>(null);
  const nextBlockId = useRef(initialDraft?.blocks.length ?? 1);
  const fieldRefs = useRef(new Map<string, HTMLElement>());
  const validationOptions = useMemo(() => ({ allowLegacyLinkEvidence: mode === 'edit' }), [mode]);

  const validationErrors = useMemo(() => showSubmitErrors
    ? Object.fromEntries(validateDailyReportDraft(draft, validationOptions).map((issue) => [issue.field, localizeValidation(issue.message, t)!])) as Record<string, string>
    : {}, [draft, showSubmitErrors, t, validationOptions]);

  const objectiveById = useMemo(() => new Map(objectives.map((objective) => [objective.id, objective])), [objectives]);

  const totalHours = draft.blocks.reduce((sum, block) => sum + (Number.isFinite(block.hours) ? block.hours : 0), 0);

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

  const removeBlock = (id: string) => {
    if (draft.blocks.length === 1) return;
    setDraft((current) => ({ ...current, blocks: current.blocks.filter((block) => block.id !== id) }));
  };

  const lastBlockComplete = validateDailyReportDraft({ blocks: [draft.blocks[draft.blocks.length - 1]!], classification: draft.classification }, validationOptions).length === 0;

  const submit = async () => {
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
    const result = await onSubmit(draft);
    setStatus(result.ok ? { key: mode === 'edit' ? 'daily.editSaved' : 'daily.submitted' } : result.error);
  };

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
                  <button type="button" className="button button--secondary" onClick={() => removeBlock(block.id)}>{t('daily.removeBlock')}</button>
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
                onEvidenceChange={(evidence) => updateBlock(block.id, { evidence })}
                errors={validationErrors}
                onFieldRef={registerField}
                onDownloadAttachment={onDownloadAttachment}
                onRemoveAttachment={onRemoveAttachment}
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
          <button type="button" className="button button--secondary" onClick={onCancel}>{t('common.cancel')}</button>
          <button type="submit" className="button button--primary">{mode === 'edit' ? t('daily.saveChanges') : t('daily.submit')}</button>
        </div>
        {status && <p className="page-notice" role="status">{t(status.key, status.values)}</p>}
      </div>
    </form>
  );
}
