import type { DailyEvidenceDraft } from '../../domain/dailyEntry';
import type { Classification, Objective } from '../../domain/types';
import { validateAttachment } from '../../services/attachmentService';
import { AttachmentList } from './AttachmentList';

interface DailyReportEvidenceProps {
  objectives: readonly Objective[];
  linkedObjectiveId?: string;
  evidence: DailyEvidenceDraft[];
  onLinkedObjectiveChange: (objectiveId: string | undefined) => void;
  onEvidenceChange: (items: DailyEvidenceDraft[]) => void;
  errors?: Record<string, string>;
}

const classifications: Array<{ value: Classification; label: string }> = [
  { value: 'public', label: '公开' },
  { value: 'internal', label: '内部' },
  { value: 'confidential', label: '机密' },
  { value: 'restricted', label: '受限' },
];

export function DailyReportEvidence({ objectives, linkedObjectiveId, evidence, onLinkedObjectiveChange, onEvidenceChange, errors = {} }: DailyReportEvidenceProps) {
  const addEvidence = () => {
    const nextNumber = evidence.length + 1;
    onEvidenceChange([...evidence, { id: `evidence-${nextNumber}`, label: '', kind: 'link', classification: 'internal' }]);
  };

  return (
    <section className="daily-evidence" aria-labelledby="daily-evidence-heading">
      <h2 id="daily-evidence-heading">关联与成果</h2>
      <div className="daily-form-grid daily-form-grid--single">
        <label htmlFor="linked-objective">
          关联已有 O
          <select id="linked-objective" value={linkedObjectiveId ?? ''} onChange={(event) => onLinkedObjectiveChange(event.target.value || undefined)}>
            <option value="">不关联</option>
            {objectives.map((objective) => <option key={objective.id} value={objective.id}>{objective.title}</option>)}
          </select>
        </label>
      </div>
      <div className="daily-evidence__header">
        <h3>成果附件或链接</h3>
        <button type="button" className="button button--secondary" onClick={addEvidence}>添加成果附件或链接</button>
      </div>
      <label className="button button--secondary">选择附件
        <input className="sr-only" aria-label="选择成果附件" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.txt" onChange={(event) => {
          const selected = Array.from(event.target.files ?? []).map((file, index): DailyEvidenceDraft => {
            const error = validateAttachment(file);
            return { id: `file-${Date.now()}-${index}`, label: file.name, kind: 'file', classification: 'internal', file, uploadState: error ? 'failed' : 'selected', uploadProgress: 0, error: error?.message };
          });
          onEvidenceChange([...evidence, ...selected]);
        }} />
      </label>
      <AttachmentList items={evidence.filter((item) => item.kind === 'file')} onRemove={(id) => onEvidenceChange(evidence.filter((item) => item.id !== id))} />
      {evidence.map((item, index) => {
        const number = index + 1;
        const errorFor = (field: 'label' | 'kind' | 'classification') => errors[`evidence.${index}.${field}`];
        const errorId = (field: 'label' | 'kind' | 'classification') => `evidence-${item.id}-${field}-error`;
        return (
          <div className="daily-evidence__row" key={item.id}>
            <label htmlFor={`evidence-${item.id}-label`}>
              成果 {number}
              <input id={`evidence-${item.id}-label`} value={item.label} aria-invalid={Boolean(errorFor('label'))} aria-describedby={errorFor('label') ? errorId('label') : undefined} onChange={(event) => onEvidenceChange(evidence.map((candidate) => candidate.id === item.id ? { ...candidate, label: event.target.value } : candidate))} placeholder="填写文件名或链接说明" />
              {errorFor('label') && <span id={errorId('label')} role="alert" className="field-error">{errorFor('label')}</span>}
            </label>
            <label htmlFor={`evidence-${item.id}-kind`}>
              成果 {number} 类型
              <select id={`evidence-${item.id}-kind`} value={item.kind} aria-invalid={Boolean(errorFor('kind'))} aria-describedby={errorFor('kind') ? errorId('kind') : undefined} onChange={(event) => onEvidenceChange(evidence.map((candidate) => candidate.id === item.id ? { ...candidate, kind: event.target.value as DailyEvidenceDraft['kind'] } : candidate))}>
                <option value="file">附件</option>
                <option value="link">链接</option>
              </select>
              {errorFor('kind') && <span id={errorId('kind')} role="alert" className="field-error">{errorFor('kind')}</span>}
            </label>
            <label htmlFor={`evidence-${item.id}-classification`}>
              成果 {number} 密级
              <select id={`evidence-${item.id}-classification`} value={item.classification} aria-invalid={Boolean(errorFor('classification'))} aria-describedby={errorFor('classification') ? errorId('classification') : undefined} onChange={(event) => onEvidenceChange(evidence.map((candidate) => candidate.id === item.id ? { ...candidate, classification: event.target.value as Classification } : candidate))}>
                {classifications.map((classification) => <option key={classification.value} value={classification.value}>{classification.label}</option>)}
              </select>
              {errorFor('classification') && <span id={errorId('classification')} role="alert" className="field-error">{errorFor('classification')}</span>}
            </label>
          </div>
        );
      })}
    </section>
  );
}
