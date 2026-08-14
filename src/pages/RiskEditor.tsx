import { useMemo, useRef, useState, type FormEvent } from 'react';
import type { KeyResult, Objective, Project, Risk, User } from '../domain/types';
import type { OwnedRiskInput, RepositoryResult } from '../data/types';
import { impactDefinitions, probabilityDefinitions, scoreRisk, type RiskLevel } from '../domain/riskScore';

export interface RiskEditorInput extends OwnedRiskInput {
  level: RiskLevel;
}

export interface EditableRiskSubject {
  type: 'key_result' | 'objective';
  id: string;
  projectId: string;
  title: string;
  classification: KeyResult['classification'];
}

export function getEditableRiskSubjects(
  currentUser: User,
  projects: Project[],
  objectives: Objective[],
  keyResults: KeyResult[],
): EditableRiskSubject[] {
  if (currentUser.role === 'hr') return [];
  const ledProjectIds = new Set(projects.filter((project) => project.leaderId === currentUser.id).map((project) => project.id));
  const projectIdByObjectiveId = new Map(objectives.map((objective) => [objective.id, objective.projectId]));
  const mayManage = (ownerId: string, projectId: string) => (
    ownerId === currentUser.id && currentUser.projectIds.includes(projectId)
  ) || (currentUser.role !== 'hr' && ledProjectIds.has(projectId));

  return [
    ...keyResults.flatMap((keyResult): EditableRiskSubject[] => {
      const projectId = projectIdByObjectiveId.get(keyResult.objectiveId);
      return projectId && mayManage(keyResult.ownerId, projectId)
        ? [{ type: 'key_result', id: keyResult.id, projectId, title: keyResult.title, classification: keyResult.classification }]
        : [];
    }),
    ...objectives.flatMap((objective): EditableRiskSubject[] => mayManage(objective.ownerId, objective.projectId)
      ? [{ type: 'objective', id: objective.id, projectId: objective.projectId, title: objective.title, classification: objective.classification }]
      : []),
  ];
}

interface RiskEditorProps {
  currentUser: User;
  projects: Project[];
  objectives: Objective[];
  keyResults: KeyResult[];
  risk?: Risk;
  onSave: (input: RiskEditorInput) => Promise<RepositoryResult<{ id: string }>>;
  onCancel?: () => void;
}

const levelLabels: Record<RiskLevel, string> = { low: '低', medium: '中', high: '高', critical: '严重' };

function subjectValue(type: EditableRiskSubject['type'], id: string): string { return `${type}:${id}`; }

export function RiskEditor({ currentUser, projects, objectives, keyResults, risk, onSave, onCancel }: RiskEditorProps) {
  const subjects = useMemo(
    () => getEditableRiskSubjects(currentUser, projects, objectives, keyResults),
    [currentUser, projects, objectives, keyResults],
  );
  const initialSubjectValue = risk?.keyResultId
    ? subjectValue('key_result', risk.keyResultId)
    : risk?.objectiveId
      ? subjectValue('objective', risk.objectiveId)
      : subjects[0]
        ? subjectValue(subjects[0].type, subjects[0].id)
        : '';
  const [selectedSubjectValue, setSelectedSubjectValue] = useState(initialSubjectValue);
  const [title, setTitle] = useState(risk?.title ?? '');
  const [probability, setProbability] = useState<1 | 2 | 3>(risk?.probability ?? 1);
  const [impact, setImpact] = useState<1 | 2 | 3>(risk?.impact ?? 1);
  const [reason, setReason] = useState(risk?.reason ?? risk?.description ?? '');
  const [mitigation, setMitigation] = useState(risk?.mitigation ?? '');
  const [lastReviewedAt, setLastReviewedAt] = useState(risk?.lastReviewedAt ?? risk?.identifiedAt ?? '');
  const [resolved, setResolved] = useState(risk?.resolved ?? false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submissionPending = useRef(false);
  const scored = scoreRisk(probability, impact);

  if (subjects.length === 0) return <p role="status">当前没有可关联风险的 KR 或目标。</p>;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submissionPending.current) return;
    setError('');
    const subject = subjects.find((item) => subjectValue(item.type, item.id) === selectedSubjectValue);
    if (!subject) {
      setError('请选择可管理的关联对象。');
      return;
    }
    if (!title.trim() || !reason.trim() || !mitigation.trim() || !lastReviewedAt) {
      setError('请填写风险标题、判断依据、缓解措施和复核日期。');
      return;
    }

    submissionPending.current = true;
    setSubmitting(true);
    try {
      const result = await onSave({
        id: risk?.id,
        projectId: subject.projectId,
        keyResultId: subject.type === 'key_result' ? subject.id : null,
        objectiveId: subject.type === 'objective' ? subject.id : null,
        title: title.trim(), probability, impact, level: scored.level, reason: reason.trim(), mitigation: mitigation.trim(),
        lastReviewedAt, classification: risk?.classification ?? subject.classification, resolved,
      });
      if (!result.ok) setError(result.error.message);
    } catch {
      setError('请求未完成，请稍后重试。');
    } finally {
      submissionPending.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="form-card form-section" noValidate>
      <h2>{risk ? '编辑风险事件' : '记录项目风险'}</h2>
      <label>关联对象
        <select value={selectedSubjectValue} onChange={(event) => setSelectedSubjectValue(event.target.value)}>
          {subjects.map((subject) => <option key={subjectValue(subject.type, subject.id)} value={subjectValue(subject.type, subject.id)}>
            {subject.type === 'key_result' ? 'KR' : '目标'} · {subject.title}
          </option>)}
        </select>
      </label>
      <label>风险标题<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>发生概率<select value={probability} onChange={(event) => setProbability(Number(event.target.value) as 1 | 2 | 3)}>{([1, 2, 3] as const).map((value) => <option value={value} key={value}>{probabilityDefinitions[value]}</option>)}</select></label>
      <label>业务影响<select value={impact} onChange={(event) => setImpact(Number(event.target.value) as 1 | 2 | 3)}>{([1, 2, 3] as const).map((value) => <option value={value} key={value}>{impactDefinitions[value]}</option>)}</select></label>
      <p aria-live="polite">矩阵坐标：影响 {impact}，概率 {probability}</p>
      <p aria-live="polite">当前评分：{probability} × {impact} = {scored.score}（{levelLabels[scored.level]}）</p>
      <label>判断依据<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <label>缓解措施<textarea value={mitigation} onChange={(event) => setMitigation(event.target.value)} /></label>
      <label>复核日期<input type="date" value={lastReviewedAt} onChange={(event) => setLastReviewedAt(event.target.value)} /></label>
      {risk && <label className="settings-toggle"><input type="checkbox" checked={resolved} onChange={(event) => setResolved(event.target.checked)} />已解决</label>}
      {error && <p role="alert">{error}</p>}
      <div className="inline-actions">
        <button className="button button--primary" type="submit" disabled={submitting}>{submitting ? '保存中…' : '保存风险'}</button>
        {onCancel && <button className="button button--secondary" type="button" onClick={onCancel} disabled={submitting}>取消</button>}
      </div>
    </form>
  );
}
