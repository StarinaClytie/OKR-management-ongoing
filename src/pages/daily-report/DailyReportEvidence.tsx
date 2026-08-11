import type { DailyEvidenceDraft } from '../../domain/dailyEntry';
import type { Classification, KeyResult, Objective } from '../../domain/types';

interface DailyReportEvidenceProps {
  objectives: readonly Objective[];
  keyResults: readonly KeyResult[];
  linkedObjectiveId?: string;
  linkedKeyResultId?: string;
  evidence: DailyEvidenceDraft[];
  onLinkedObjectiveChange: (objectiveId: string | undefined) => void;
  onLinkedKeyResultChange: (keyResultId: string | undefined) => void;
  onEvidenceChange: (items: DailyEvidenceDraft[]) => void;
}

const classifications: Array<{ value: Classification; label: string }> = [
  { value: 'public', label: '公开' },
  { value: 'internal', label: '内部' },
  { value: 'confidential', label: '机密' },
  { value: 'restricted', label: '受限' },
];

export function DailyReportEvidence({ objectives, keyResults, linkedObjectiveId, linkedKeyResultId, evidence, onLinkedObjectiveChange, onLinkedKeyResultChange, onEvidenceChange }: DailyReportEvidenceProps) {
  const availableKeyResults = linkedObjectiveId ? keyResults.filter((keyResult) => keyResult.objectiveId === linkedObjectiveId) : [];
  const addEvidence = () => {
    const nextNumber = evidence.length + 1;
    onEvidenceChange([...evidence, { id: `evidence-${nextNumber}`, label: '', kind: 'link', classification: 'internal' }]);
  };

  return (
    <section className="daily-evidence" aria-labelledby="daily-evidence-heading">
      <h2 id="daily-evidence-heading">关联与成果</h2>
      <div className="daily-form-grid">
        <label htmlFor="linked-objective">
          关联已有 O
          <select id="linked-objective" value={linkedObjectiveId ?? ''} onChange={(event) => onLinkedObjectiveChange(event.target.value || undefined)}>
            <option value="">不关联</option>
            {objectives.map((objective) => <option key={objective.id} value={objective.id}>{objective.title}</option>)}
          </select>
        </label>
        <label htmlFor="linked-key-result">
          关联已有 KR（可选）
          <select id="linked-key-result" value={linkedKeyResultId ?? ''} disabled={!linkedObjectiveId} onChange={(event) => onLinkedKeyResultChange(event.target.value || undefined)}>
            <option value="">不关联</option>
            {availableKeyResults.map((keyResult) => <option key={keyResult.id} value={keyResult.id}>{keyResult.title}</option>)}
          </select>
        </label>
      </div>
      <div className="daily-evidence__header">
        <h3>成果附件或链接</h3>
        <button type="button" className="button button--secondary" onClick={addEvidence}>添加成果附件或链接</button>
      </div>
      {evidence.map((item, index) => {
        const number = index + 1;
        return (
          <div className="daily-evidence__row" key={item.id}>
            <label htmlFor={`evidence-${item.id}-label`}>
              成果 {number}
              <input id={`evidence-${item.id}-label`} value={item.label} onChange={(event) => onEvidenceChange(evidence.map((candidate) => candidate.id === item.id ? { ...candidate, label: event.target.value } : candidate))} placeholder="填写文件名或链接说明" />
            </label>
            <label htmlFor={`evidence-${item.id}-kind`}>
              成果 {number} 类型
              <select id={`evidence-${item.id}-kind`} value={item.kind} onChange={(event) => onEvidenceChange(evidence.map((candidate) => candidate.id === item.id ? { ...candidate, kind: event.target.value as DailyEvidenceDraft['kind'] } : candidate))}>
                <option value="file">附件</option>
                <option value="link">链接</option>
              </select>
            </label>
            <label htmlFor={`evidence-${item.id}-classification`}>
              成果 {number} 密级
              <select id={`evidence-${item.id}-classification`} value={item.classification} onChange={(event) => onEvidenceChange(evidence.map((candidate) => candidate.id === item.id ? { ...candidate, classification: event.target.value as Classification } : candidate))}>
                {classifications.map((classification) => <option key={classification.value} value={classification.value}>{classification.label}</option>)}
              </select>
            </label>
          </div>
        );
      })}
    </section>
  );
}
