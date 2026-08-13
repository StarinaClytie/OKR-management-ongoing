import { useEffect, useMemo, useRef, useState } from 'react';
import { getKrAverageReference, validateDailyReportDraft, validateProgress, type DailyKeyResultDraft, type DailyReportDraft } from '../../domain/dailyEntry';
import type { KeyResult, Objective } from '../../domain/types';
import { DailyKeyResultEditor } from './DailyKeyResultEditor';
import { DailyKrHelp } from './DailyKrHelp';
import { DailyObjectiveField } from './DailyObjectiveField';
import { DailyReportEvidence } from './DailyReportEvidence';

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
    ? Object.fromEntries(validateDailyReportDraft(draft).map((issue) => [issue.field, issue.message])) as Record<string, string>
    : {}, [draft, showSubmitErrors]);
  const objectiveProgressValidation = validateProgress(draft.objectiveProgress);
  const objectiveProgressError = showSubmitErrors || draft.objectiveProgress !== undefined ? objectiveProgressValidation : null;
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

  const saveDraft = () => setStatus('草稿已保存在当前页面。');
  const submit = async () => {
    setShowSubmitErrors(true);
    if (validateDailyReportDraft(draft).length > 0) {
      setStatus('请先补全或修正必填项。');
      return;
    }
    const result = await onSubmit(draft);
    setStatus(result.ok ? (mode === 'edit' ? '日报修改已保存。' : '日报已提交。') : result.error);
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
            <h2 id="daily-key-results-heading">当日 KR</h2>
            <button type="button" className="button button--secondary" onClick={addKeyResult}>添加 KR</button>
          </div>
          {draft.keyResults.map((keyResult, index) => (
            <DailyKeyResultEditor
              key={keyResult.id}
              index={index}
              keyResult={keyResult}
              errors={{ title: validationErrors[`keyResults.${index}.title`], hours: validationErrors[`keyResults.${index}.hours`], progress: showSubmitErrors || keyResult.progress !== undefined ? validateProgress(keyResult.progress) ?? undefined : undefined, targetValue: validationErrors[`keyResults.${index}.targetValue`], actualValue: validationErrors[`keyResults.${index}.actualValue`], baselineValue: validationErrors[`keyResults.${index}.baselineValue`], dueDate: validationErrors[`keyResults.${index}.dueDate`], milestoneStatus: validationErrors[`keyResults.${index}.milestoneStatus`], acceptanceCriteria: validationErrors[`keyResults.${index}.acceptanceCriteria`], workNote: validationErrors[`keyResults.${index}.workNote`] }}
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
          <button type="button" className="button button--secondary" onClick={onCancel}>取消</button>
          <button type="button" className="button button--secondary" onClick={saveDraft}>保存草稿</button>
          <button type="submit" className="button button--primary">{mode === 'edit' ? '保存日报修改' : '提交日报'}</button>
        </div>
        {status && <p className="page-notice" role="status">{status}</p>}
      </div>
      {!narrow && activeKr && <aside className="daily-entry-help-shell" aria-label="填写帮助"><DailyKrHelp type={activeKr.type} /></aside>}
    </form>
  );
}
