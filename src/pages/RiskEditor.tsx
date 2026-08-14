import { useMemo, useRef, useState, type FormEvent } from 'react';
import type { KeyResult, Objective, Project, Risk, User } from '../domain/types';
import type { OwnedRiskInput, RepositoryResult } from '../data/types';
import { scoreRisk, type RiskLevel } from '../domain/riskScore';
import { useLocale } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';
import { repositoryErrorKey } from '../i18n/repositoryErrors';

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

const levelLabels: Record<RiskLevel, MessageKey> = { low: 'riskEditor.levelLow', medium: 'riskEditor.levelMedium', high: 'riskEditor.levelHigh', critical: 'riskEditor.levelCritical' };
const probabilityKeys = { 1: 'riskEditor.probability1', 2: 'riskEditor.probability2', 3: 'riskEditor.probability3' } as const;
const impactKeys = { 1: 'riskEditor.impact1', 2: 'riskEditor.impact2', 3: 'riskEditor.impact3' } as const;

function subjectValue(type: EditableRiskSubject['type'], id: string): string { return `${type}:${id}`; }

export function RiskEditor({ currentUser, projects, objectives, keyResults, risk, onSave, onCancel }: RiskEditorProps) {
  const { t } = useLocale();
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
  const [error, setError] = useState<MessageKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submissionPending = useRef(false);
  const scored = scoreRisk(probability, impact);

  if (subjects.length === 0) return <p role="status">{t('riskEditor.none')}</p>;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submissionPending.current) return;
    setError(null);
    const subject = subjects.find((item) => subjectValue(item.type, item.id) === selectedSubjectValue);
    if (!subject) {
      setError('riskEditor.subjectRequired');
      return;
    }
    if (!title.trim() || !reason.trim() || !mitigation.trim() || !lastReviewedAt) {
      setError('riskEditor.fieldsRequired');
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
      if (!result.ok) setError(repositoryErrorKey(result.error.code));
    } catch {
      setError('common.requestFailed');
    } finally {
      submissionPending.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="form-card form-section" noValidate>
      <h2>{risk ? t('riskEditor.editTitle') : t('riskEditor.createTitle')}</h2>
      <label>{t('riskEditor.subject')}
        <select value={selectedSubjectValue} onChange={(event) => setSelectedSubjectValue(event.target.value)}>
          {subjects.map((subject) => <option key={subjectValue(subject.type, subject.id)} value={subjectValue(subject.type, subject.id)}>
            {subject.type === 'key_result' ? 'KR' : t('riskEditor.objective')} · {subject.title}
          </option>)}
        </select>
      </label>
      <label>{t('riskEditor.title')}<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>{t('riskEditor.probability')}<select value={probability} onChange={(event) => setProbability(Number(event.target.value) as 1 | 2 | 3)}>{([1, 2, 3] as const).map((value) => <option value={value} key={value}>{t(probabilityKeys[value])}</option>)}</select></label>
      <label>{t('riskEditor.impact')}<select value={impact} onChange={(event) => setImpact(Number(event.target.value) as 1 | 2 | 3)}>{([1, 2, 3] as const).map((value) => <option value={value} key={value}>{t(impactKeys[value])}</option>)}</select></label>
      <p aria-live="polite">{t('riskEditor.coordinate', { impact, probability })}</p>
      <p aria-live="polite">{t('riskEditor.currentScore', { probability, impact, score: scored.score, level: t(levelLabels[scored.level]) })}</p>
      <label>{t('risk.reason')}<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <label>{t('risk.mitigation')}<textarea value={mitigation} onChange={(event) => setMitigation(event.target.value)} /></label>
      <label>{t('riskEditor.reviewDate')}<input type="date" value={lastReviewedAt} onChange={(event) => setLastReviewedAt(event.target.value)} /></label>
      {risk && <label className="settings-toggle"><input type="checkbox" checked={resolved} onChange={(event) => setResolved(event.target.checked)} />{t('riskEditor.resolved')}</label>}
      {error && <p role="alert">{t(error)}</p>}
      <div className="inline-actions">
        <button className="button button--primary" type="submit" disabled={submitting}>{submitting ? t('common.saving') : t('riskEditor.save')}</button>
        {onCancel && <button className="button button--secondary" type="button" onClick={onCancel} disabled={submitting}>{t('common.cancel')}</button>}
      </div>
    </form>
  );
}
