import { useEffect, useMemo, useRef, useState } from 'react';
import { getKrAverageReference, validateProgress, type DailyKeyResultDraft, type DailyReportDraft } from '../../domain/dailyEntry';
import type { KeyResult, Objective } from '../../domain/types';
import { DailyKeyResultEditor } from './DailyKeyResultEditor';
import { DailyKrHelp } from './DailyKrHelp';
import { DailyObjectiveField } from './DailyObjectiveField';
import { DailyReportEvidence } from './DailyReportEvidence';

interface DailyReportFormProps {
  objectives: readonly Objective[];
  keyResults: readonly KeyResult[];
  onCancel: () => void;
  onSubmit: (draft: DailyReportDraft) => void;
}

const initialKeyResult = (id: string): DailyKeyResultDraft => ({
  id,
  title: '',
  type: 'quantity',
  hours: 0,
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

export function DailyReportForm({ objectives, keyResults, onCancel, onSubmit }: DailyReportFormProps) {
  const [draft, setDraft] = useState<DailyReportDraft>({
    dailyObjective: '',
    objectiveProgress: undefined,
    keyResults: [initialKeyResult('daily-kr-1')],
    evidence: [],
    classification: 'internal',
  });
  const [activeKrId, setActiveKrId] = useState('daily-kr-1');
  const [showSubmitErrors, setShowSubmitErrors] = useState(false);
  const [status, setStatus] = useState('');
  const nextKrId = useRef(2);
  const narrow = useNarrowDailyForm();
  const averageReference = useMemo(() => getKrAverageReference(draft.keyResults), [draft.keyResults]);
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

  const hasInvalidProgress = validateProgress(draft.objectiveProgress) !== null
    || draft.keyResults.some((keyResult) => validateProgress(keyResult.progress) !== null);
  const hasInvalidSubjectiveCriteria = draft.keyResults.some((keyResult) => keyResult.type === 'subjective' && !keyResult.acceptanceCriteria?.trim());
  const saveDraft = () => setStatus('草稿已保存在当前页面。');
  const submit = () => {
    setShowSubmitErrors(true);
    if (hasInvalidProgress || hasInvalidSubjectiveCriteria) {
      setStatus('请先补全或修正必填项。');
      return;
    }
    onSubmit(draft);
    setStatus('日报已提交（当前页面模拟）。');
  };

  return (
    <form className="daily-entry-layout" noValidate onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <div className="daily-entry-form">
        <DailyObjectiveField
          objective={draft.dailyObjective}
          progress={draft.objectiveProgress}
          progressError={objectiveProgressError}
          averageReference={averageReference}
          onObjectiveChange={(dailyObjective) => setDraft((current) => ({ ...current, dailyObjective }))}
          onProgressChange={updateObjectiveProgress}
        />
        <section className="daily-key-results" aria-labelledby="daily-key-results-heading">
          <div className="daily-evidence__header">
            <h2 id="daily-key-results-heading">当日 KR</h2>
            <button type="button" className="button button--secondary" onClick={addKeyResult}>添加 KR</button>
          </div>
          {draft.keyResults.map((keyResult, index) => (
            <DailyKeyResultEditor
              key={keyResult.id}
              index={index}
              keyResult={keyResult}
              progressError={showSubmitErrors || keyResult.progress !== undefined ? validateProgress(keyResult.progress) : null}
              acceptanceCriteriaError={showSubmitErrors && keyResult.type === 'subjective' && !keyResult.acceptanceCriteria?.trim() ? '请填写主观型 KR 的验收标准' : null}
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
        />
        <div className="daily-form-actions">
          <button type="button" className="button button--secondary" onClick={onCancel}>取消</button>
          <button type="button" className="button button--secondary" onClick={saveDraft}>保存草稿</button>
          <button type="submit" className="button button--primary">提交日报</button>
        </div>
        {status && <p className="page-notice" role="status">{status}</p>}
      </div>
      {!narrow && activeKr && <aside className="daily-entry-help-shell" aria-label="填写帮助"><DailyKrHelp type={activeKr.type} /></aside>}
    </form>
  );
}
