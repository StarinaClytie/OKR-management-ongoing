import { useMemo, useState } from 'react';
import { getKrAverageReference, getKrGuidance, validateProgress, type DailyKeyResultDraft, type DailyKrType, type DailyReportDraft } from '../../domain/dailyEntry';
import type { KeyResult, Objective } from '../../domain/types';
import { DailyKeyResultEditor } from './DailyKeyResultEditor';
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
  progress: 0,
  workNote: '',
});

export function DailyReportForm({ objectives, keyResults, onCancel, onSubmit }: DailyReportFormProps) {
  const [draft, setDraft] = useState<DailyReportDraft>({
    dailyObjective: '',
    objectiveProgress: 0,
    keyResults: [initialKeyResult('daily-kr-1')],
    evidence: [],
    classification: 'internal',
  });
  const [objectiveProgressEntered, setObjectiveProgressEntered] = useState(false);
  const [selectedType, setSelectedType] = useState<DailyKrType>('quantity');
  const [status, setStatus] = useState('');
  const averageReference = useMemo(() => getKrAverageReference(draft.keyResults), [draft.keyResults]);
  const objectiveProgressError = objectiveProgressEntered ? validateProgress(draft.objectiveProgress) : null;
  const guidance = getKrGuidance(selectedType);

  const updateKeyResult = (id: string, patch: Partial<DailyKeyResultDraft>) => {
    setDraft((current) => ({ ...current, keyResults: current.keyResults.map((keyResult) => keyResult.id === id ? { ...keyResult, ...patch } : keyResult) }));
  };

  const updateKeyResultProgress = (id: string, progress: number) => {
    updateKeyResult(id, { progress });
  };

  const updateObjectiveProgress = (progress: number) => {
    setObjectiveProgressEntered(true);
    setDraft((current) => ({ ...current, objectiveProgress: progress }));
  };

  const addKeyResult = () => {
    setDraft((current) => ({ ...current, keyResults: [...current.keyResults, initialKeyResult(`daily-kr-${current.keyResults.length + 1}`)] }));
  };

  const changeLinkedObjective = (linkedObjectiveId: string | undefined) => {
    setDraft((current) => ({
      ...current,
      linkedObjectiveId,
      keyResults: current.keyResults.map((keyResult, index) => index === 0 ? { ...keyResult, linkedKeyResultId: undefined } : keyResult),
    }));
  };

  const changeLinkedKeyResult = (linkedKeyResultId: string | undefined) => {
    setDraft((current) => ({ ...current, keyResults: current.keyResults.map((keyResult, index) => index === 0 ? { ...keyResult, linkedKeyResultId } : keyResult) }));
  };

  const invalidProgress = objectiveProgressError || draft.keyResults.map((keyResult) => validateProgress(keyResult.progress)).find(Boolean);
  const saveDraft = () => setStatus('草稿已保存在当前页面。');
  const submit = () => {
    if (invalidProgress) {
      setStatus('请先修正完成度。');
      return;
    }
    onSubmit(draft);
    setStatus('日报已提交（当前页面模拟）。');
  };

  return (
    <form className="daily-entry-layout" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <div className="daily-entry-form">
        <DailyObjectiveField
          objective={draft.dailyObjective}
          progress={draft.objectiveProgress}
          progressEntered={objectiveProgressEntered}
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
              progressError={validateProgress(keyResult.progress)}
              onChange={(patch) => updateKeyResult(keyResult.id, patch)}
              onProgressChange={(progress) => updateKeyResultProgress(keyResult.id, progress)}
              onActivate={setSelectedType}
            />
          ))}
        </section>
        <DailyReportEvidence
          objectives={objectives}
          keyResults={keyResults}
          linkedObjectiveId={draft.linkedObjectiveId}
          linkedKeyResultId={draft.keyResults[0]?.linkedKeyResultId}
          evidence={draft.evidence}
          onLinkedObjectiveChange={changeLinkedObjective}
          onLinkedKeyResultChange={changeLinkedKeyResult}
          onEvidenceChange={(evidence) => setDraft((current) => ({ ...current, evidence }))}
        />
        <div className="daily-form-actions">
          <button type="button" className="button button--secondary" onClick={onCancel}>取消</button>
          <button type="button" className="button button--secondary" onClick={saveDraft}>保存草稿</button>
          <button type="submit" className="button button--primary">提交日报</button>
        </div>
        {status && <p className="page-notice" role="status">{status}</p>}
      </div>
      <aside className="daily-entry-help" aria-label="填写帮助">
        <p className="daily-entry-help__eyebrow">{guidance.label}填写参考</p>
        <p>公式参考：{guidance.formula}</p>
        <p>示例：<span>{guidance.example}</span></p>
        <p>注意：{guidance.caution}</p>
      </aside>
    </form>
  );
}
