import { useEffect, useMemo, useRef, useState } from 'react';
import { getKrAverageReference, validateDailyReportDraft, validateProgress, type DailyKeyResultDraft, type DailyReportDraft } from '../../domain/dailyEntry';
import type { KeyResult, Objective } from '../../domain/types';
import { DailyKeyResultEditor } from './DailyKeyResultEditor';
import { DailyKrHelp } from './DailyKrHelp';
import { DailyObjectiveField } from './DailyObjectiveField';
import { DailyReportEvidence } from './DailyReportEvidence';
import { useLocale, type LocaleContextValue } from '../../i18n/LocaleProvider';
import type { MessageKey } from '../../i18n/messages';

export type DailyReportSubmitResult =
  | { ok: true }
  | { ok: false; error: string };

interface DailyReportFormProps {
  mode?: 'create' | 'edit';
  initialDraft?: DailyReportDraft;
  objectives: readonly Objective[];
  keyResults: readonly KeyResult[];
  onCancel: () => void;
  onSubmit: (draft: DailyReportDraft) => DailyReportSubmitResult | Promise<DailyReportSubmitResult>;
}

const initialKeyResult = (id: string): DailyKeyResultDraft => ({
  id,
  title: '',
  type: 'quantity',
  hours: undefined,
  progress: undefined,
  workNote: '',
});

const validationKeys: Record<string, MessageKey> = {
  '请填写完成度': 'validation.progressRequired',
  '完成度需填写 0%～100%': 'validation.progressRange',
  '请填写当日 O': 'validation.objectiveRequired',
  '请至少添加一个当日 KR': 'validation.krRequired',
  '请填写 KR 内容': 'validation.krContentRequired',
  '请填写 KR 工作说明': 'validation.krNoteRequired',
  '工时需填写有限且不小于 0 的数值': 'validation.hoursInvalid',
  '请填写数量型 KR 的目标值': 'validation.quantityTarget',
  '数量型 KR 的目标值需填写有限且不小于 0 的数值': 'validation.valueInvalid',
  '当前实际值需填写有限且不小于 0 的数值': 'validation.currentActual',
  '请填写比率型 KR 的起始值': 'validation.ratioBaseline',
  '比率型 KR 的起始值需填写有限且不小于 0 的数值': 'validation.valueInvalid',
  '请填写比率型 KR 的目标值': 'validation.ratioTarget',
  '比率型 KR 的目标值需填写有限且不小于 0 的数值': 'validation.valueInvalid',
  '请填写比率型 KR 的当前值': 'validation.ratioCurrent',
  '比率型 KR 的当前值需填写有限且不小于 0 的数值': 'validation.valueInvalid',
  '请填写里程碑截止日期': 'validation.milestoneDate',
  '请选择里程碑当前状态': 'validation.milestoneStatus',
  '请填写主观型 KR 的验收标准': 'validation.subjectiveCriteria',
  '请填写成果名称或链接说明': 'validation.evidenceName',
  '请选择成果类型': 'validation.evidenceType',
  '请选择有效的成果密级': 'validation.evidenceClassification',
  '请选择有效的日报密级': 'validation.reportClassification',
};

function localizeValidation(message: string | null, t: LocaleContextValue['t']): string | null {
  if (!message) return null;
  const key = validationKeys[message];
  return key ? t(key) : t('common.requestFailed');
}

function useNarrowDailyForm() {
  const [narrow, setNarrow] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 760px)').matches);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(max-width: 760px)');
    const update = () => setNarrow(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return narrow;
}

export function DailyReportForm({ mode = 'create', initialDraft, objectives, keyResults, onCancel, onSubmit }: DailyReportFormProps) {
  const { t } = useLocale();
  const [draft, setDraft] = useState<DailyReportDraft>(() => initialDraft ? structuredClone(initialDraft) : ({
    dailyObjective: '',
    objectiveProgress: undefined,
    keyResults: [initialKeyResult('daily-kr-1')],
    evidence: [],
    classification: 'internal',
  }));
  const [activeKrId, setActiveKrId] = useState(initialDraft?.keyResults[0]?.id ?? 'daily-kr-1');
  const [showSubmitErrors, setShowSubmitErrors] = useState(false);
  const [status, setStatus] = useState('');
  const nextKrId = useRef(2);
  const narrow = useNarrowDailyForm();
  const averageReference = useMemo(() => getKrAverageReference(draft.keyResults), [draft.keyResults]);
  const validationErrors = useMemo(() => showSubmitErrors
    ? Object.fromEntries(validateDailyReportDraft(draft).map((issue) => [issue.field, localizeValidation(issue.message, t)!])) as Record<string, string>
    : {}, [draft, showSubmitErrors, t]);
  const objectiveProgressValidation = validateProgress(draft.objectiveProgress);
  const objectiveProgressError = showSubmitErrors || draft.objectiveProgress !== undefined ? localizeValidation(objectiveProgressValidation, t) : null;
  const activeKr = draft.keyResults.find((keyResult) => keyResult.id === activeKrId);

  const updateKeyResult = (id: string, patch: Partial<DailyKeyResultDraft>) => {
    setDraft((current) => ({ ...current, keyResults: current.keyResults.map((keyResult) => keyResult.id === id ? { ...keyResult, ...patch } : keyResult) }));
  };

  const updateKeyResultProgress = (id: string, progress: number | undefined) => {
    updateKeyResult(id, { progress });
  };

  const updateObjectiveProgress = (progress: number | undefined) => {
    setDraft((current) => ({ ...current, objectiveProgress: progress }));
  };

  const addKeyResult = () => {
    const id = `daily-kr-${nextKrId.current++}`;
    setDraft((current) => ({ ...current, keyResults: [...current.keyResults, initialKeyResult(id)] }));
    setActiveKrId(id);
  };

  const moveKeyResult = (index: number, offset: -1 | 1) => {
    setDraft((current) => {
      const destination = index + offset;
      if (destination < 0 || destination >= current.keyResults.length) return current;
      const keyResults = [...current.keyResults];
      [keyResults[index], keyResults[destination]] = [keyResults[destination]!, keyResults[index]!];
      return { ...current, keyResults };
    });
  };

  const removeKeyResult = (id: string) => {
    if (draft.keyResults.length === 1) return;
    const index = draft.keyResults.findIndex((keyResult) => keyResult.id === id);
    const keyResults = draft.keyResults.filter((keyResult) => keyResult.id !== id);
    setDraft((current) => ({ ...current, keyResults }));
    if (id === activeKrId) setActiveKrId(keyResults[Math.min(index, keyResults.length - 1)]!.id);
  };

  const changeLinkedObjective = (linkedObjectiveId: string | undefined) => {
    const compatibleKeyResultIds = new Set(
      keyResults.filter((keyResult) => keyResult.objectiveId === linkedObjectiveId).map((keyResult) => keyResult.id),
    );
    setDraft((current) => ({
      ...current,
      linkedObjectiveId,
      keyResults: current.keyResults.map((keyResult) => keyResult.linkedKeyResultId && !compatibleKeyResultIds.has(keyResult.linkedKeyResultId)
        ? { ...keyResult, linkedKeyResultId: undefined }
        : keyResult),
    }));
  };

  const saveDraft = () => setStatus(t('daily.draftSaved'));
  const submit = async () => {
    setShowSubmitErrors(true);
    if (validateDailyReportDraft(draft).length > 0) {
      setStatus(t('daily.fixRequired'));
      return;
    }
    const result = await onSubmit(draft);
    setStatus(result.ok ? (mode === 'edit' ? t('daily.editSaved') : t('daily.submitted')) : result.error);
  };

  return (
    <form className="daily-entry-layout" noValidate onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <div className="daily-entry-form">
        <DailyObjectiveField
          objective={draft.dailyObjective}
          objectiveError={validationErrors.dailyObjective ?? null}
          progress={draft.objectiveProgress}
          progressError={objectiveProgressError}
          averageReference={averageReference}
          onObjectiveChange={(dailyObjective) => setDraft((current) => ({ ...current, dailyObjective }))}
          onProgressChange={updateObjectiveProgress}
        />
        <section className="daily-key-results form-card form-section" aria-labelledby="daily-key-results-heading">
          <div className="daily-evidence__header">
            <h2 id="daily-key-results-heading">{t('daily.todayKrs')}</h2>
            <button type="button" className="button button--secondary" onClick={addKeyResult}>{t('daily.addKr')}</button>
          </div>
          {draft.keyResults.map((keyResult, index) => (
            <DailyKeyResultEditor
              key={keyResult.id}
              index={index}
              keyResult={keyResult}
              errors={{ title: validationErrors[`keyResults.${index}.title`], hours: validationErrors[`keyResults.${index}.hours`], progress: showSubmitErrors || keyResult.progress !== undefined ? localizeValidation(validateProgress(keyResult.progress), t) ?? undefined : undefined, targetValue: validationErrors[`keyResults.${index}.targetValue`], actualValue: validationErrors[`keyResults.${index}.actualValue`], baselineValue: validationErrors[`keyResults.${index}.baselineValue`], dueDate: validationErrors[`keyResults.${index}.dueDate`], milestoneStatus: validationErrors[`keyResults.${index}.milestoneStatus`], acceptanceCriteria: validationErrors[`keyResults.${index}.acceptanceCriteria`], workNote: validationErrors[`keyResults.${index}.workNote`] }}
              onChange={(patch) => updateKeyResult(keyResult.id, patch)}
              onProgressChange={(progress) => updateKeyResultProgress(keyResult.id, progress)}
              onActivate={() => setActiveKrId(keyResult.id)}
              onMoveUp={() => moveKeyResult(index, -1)}
              onMoveDown={() => moveKeyResult(index, 1)}
              onRemove={() => removeKeyResult(keyResult.id)}
              canMoveUp={index > 0}
              canMoveDown={index < draft.keyResults.length - 1}
              canRemove={draft.keyResults.length > 1}
              linkedObjectiveId={draft.linkedObjectiveId}
              availableKeyResults={draft.linkedObjectiveId ? keyResults.filter((candidate) => candidate.objectiveId === draft.linkedObjectiveId) : []}
              onLinkedKeyResultChange={(linkedKeyResultId) => updateKeyResult(keyResult.id, { linkedKeyResultId })}
              help={narrow && activeKrId === keyResult.id ? <DailyKrHelp type={keyResult.type} className="daily-entry-help--mobile" /> : undefined}
            />
          ))}
        </section>
        <DailyReportEvidence
          objectives={objectives}
          linkedObjectiveId={draft.linkedObjectiveId}
          evidence={draft.evidence}
          onLinkedObjectiveChange={changeLinkedObjective}
          onEvidenceChange={(evidence) => setDraft((current) => ({ ...current, evidence }))}
          errors={validationErrors}
        />
        <div className="daily-form-actions">
          <button type="button" className="button button--secondary" onClick={onCancel}>{t('common.cancel')}</button>
          <button type="button" className="button button--secondary" onClick={saveDraft}>{t('daily.saveDraft')}</button>
          <button type="submit" className="button button--primary">{mode === 'edit' ? t('daily.saveChanges') : t('daily.submit')}</button>
        </div>
        {status && <p className="page-notice" role="status">{status}</p>}
      </div>
      {!narrow && activeKr && <aside className="daily-entry-help-shell" aria-label={t('daily.help')}><DailyKrHelp type={activeKr.type} /></aside>}
    </form>
  );
}
