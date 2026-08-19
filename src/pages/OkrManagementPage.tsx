import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissionService';
import { DataTable } from '../components/DataTable';
import { OkrStatusBadge } from '../components/OkrStatusBadge';
import { PageHeader } from '../components/PageHeader';
import { ProgressRing } from '../components/ProgressRing';
import type { OkrRepository, OrganizationUser, OwnedRiskInput, RepositoryResult } from '../data/types';
import { isKrCollaborator } from '../domain/krAssignments';
import { filterObjectiveSummaries, summarizeObjective, type ObjectiveFilter, type ObjectiveSummary } from '../domain/objectivePortfolio';
import { describeKeyResultMetric } from '../domain/okrMetrics';
import { canCreateObjective } from '../domain/okrPermissions';
import { currentBusinessDate } from '../domain/progressStatus';
import type { Risk } from '../domain/types';
import { useLocale } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';
import { repository } from '../lib/supabase';
import { mockRepository, type DashboardData } from '../mocks/repository';
import { getEditableRiskSubjects, RiskEditor, type RiskEditorInput } from './RiskEditor';
import { ObjectiveFormModal, type ObjectiveFormValues } from './okr/ObjectiveFormModal';

const RiskMatrixWidget = lazy(async () => {
  const module = await import('../dashboard/widgets/RiskMatrixWidget');
  return { default: module.RiskMatrixWidget };
});

const filterLabels: Record<ObjectiveFilter, MessageKey> = {
  all: 'okr.all',
  mine: 'okr.myProjects',
  myKrs: 'okr.myKrs',
  risk: 'okr.riskItems',
};

function riskStatus(input: Pick<OwnedRiskInput, 'probability' | 'impact' | 'resolved'>): Risk['status'] {
  if (input.resolved) return 'on_track';
  const score = input.probability * input.impact;
  return score === 9 ? 'off_track' : score >= 6 ? 'at_risk' : 'on_track';
}

export function ObjectiveCard({ summary, users, readableKrIds }: { summary: ObjectiveSummary; users: DashboardData['users']; readableKrIds: ReadonlySet<string> }) {
  const { t } = useLocale();
  const { objective, keyResults, overallProgress, okrStatus, riskCount, updateCount } = summary;
  const leaderName = users.find((user) => user.id === objective.ownerId)?.name ?? '—';
  const visibleKeyResults = keyResults.filter((keyResult) => readableKrIds.has(keyResult.id));

  return (
    <article className="okr-card">
      <header className="okr-card__head">
        <div>
          <p className="okr-card__number">{objective.number ?? '—'}</p>
          <h2><Link className="text-link" to={`/okrs/${objective.id}`}>{objective.title}</Link></h2>
          <p className="okr-card__meta">{t('okr.projectLead')}：{leaderName} · {objective.startDate} — {objective.dueDate}</p>
        </div>
        <div className="okr-card__progress">
          <ProgressRing value={overallProgress} size="small" />
          <OkrStatusBadge status={okrStatus} />
        </div>
      </header>
      <ul className="okr-kr-list" aria-label={t('okr.krBreakdown')}>
        {visibleKeyResults.map((keyResult) => (
          <li key={keyResult.id} className="okr-kr-row">
            <span className="okr-kr-row__title">{keyResult.title}</span>
            <span className="okr-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={keyResult.progress} aria-label={keyResult.title}>
              <span className="okr-progress-fill" style={{ width: `${keyResult.progress}%` }} />
            </span>
            <span className="okr-kr-row__value">{keyResult.progress}%</span>
            <span className="okr-kr-row__owner">{users.find((user) => user.id === keyResult.ownerId)?.name ?? '—'}</span>
          </li>
        ))}
      </ul>
      <footer className="okr-card__footer">
        <span>{t('okr.risksCount', { count: riskCount })}</span>
        <span>{t('okr.updatesCount', { count: updateCount })}</span>
      </footer>
    </article>
  );
}

export function OkrManagementPage({ dataRepository = repository }: { dataRepository?: OkrRepository }) {
  const { t } = useLocale();
  const { currentUser, mode } = useAuth();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<DashboardData | null>(() => currentUser && mode === 'demo' ? mockRepository.getDashboardData(currentUser.id) : null);
  const [loading, setLoading] = useState(mode === 'supabase');
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const [filter, setFilter] = useState<ObjectiveFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [eligibleUsers, setEligibleUsers] = useState<OrganizationUser[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [activeEditor, setActiveEditor] = useState<'risk' | null>(null);
  const [editingRisk, setEditingRisk] = useState<Risk | undefined>();
  const [resolvingRiskId, setResolvingRiskId] = useState<string>();
  const [selectedMatrixProjectId, setSelectedMatrixProjectId] = useState('');

  const refresh = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const result = await dataRepository.getDashboardData(currentUser.id);
      if (!result.ok) return;
      setData(result.data);
    } finally {
      setLoading(false);
    }
  }, [currentUser, dataRepository]);

  useEffect(() => {
    if (!currentUser) return;
    if (mode === 'demo') {
      setData(mockRepository.getDashboardData(currentUser.id));
      setLoading(false);
      return;
    }
    void refresh();
  }, [currentUser, mode, refresh]);

  const evaluationDate = useMemo(() => currentBusinessDate(), []);
  const summaries = useMemo(() => {
    if (!data) return [];
    const readable = data.objectives
      .filter((objective) => objective.archivedAt == null)
      .filter((objective) => mode === 'supabase' || can(currentUser, 'okr.read_summary', objective).allowed);
    return readable.map((objective) => summarizeObjective(objective, data.keyResults, data.krProgressUpdates, data.risks, evaluationDate));
  }, [data, currentUser, mode, evaluationDate]);

  const visibleSummaries = useMemo(() => currentUser && data
    ? filterObjectiveSummaries(filter, summaries, currentUser, data.krAssignments)
    : [], [filter, summaries, currentUser, data]);

  const myContributions = useMemo(() => {
    if (!currentUser || !data || currentUser.role === 'hr') return [];
    return summaries.flatMap((summary) => summary.keyResults
      .filter((keyResult) => keyResult.ownerId === currentUser.id || isKrCollaborator(currentUser.id, keyResult.id, data.krAssignments))
      .map((keyResult) => ({ keyResult, objective: summary.objective, isCollaborator: keyResult.ownerId !== currentUser.id })));
  }, [summaries, currentUser, data]);

  const readableKrIds = useMemo(() => {
    if (!data) return new Set<string>();
    if (mode === 'supabase') return new Set(data.keyResults.map((keyResult) => keyResult.id));
    return new Set(data.keyResults.filter((keyResult) => can(currentUser, 'okr.read_detail', keyResult).allowed).map((keyResult) => keyResult.id));
  }, [data, currentUser, mode]);

  const editableRiskSubjects = useMemo(() => currentUser && data
    ? getEditableRiskSubjects(currentUser, data.projects, data.objectives, data.keyResults)
    : [], [currentUser, data]);

  if (!currentUser) return null;
  if (loading && !data) return <section className="business-page"><p role="status">{t('okr.loading')}</p></section>;
  if (!data) return null;

  const signedInUser = currentUser;
  const dashboardData = data;
  const readableRisks = mode === 'supabase'
    ? dashboardData.risks
    : dashboardData.risks.filter((risk) => can(signedInUser, 'risk.read', risk).allowed);
  const ledProjectIds = new Set(dashboardData.projects.filter((project) => project.leaderId === signedInUser.id).map((project) => project.id));
  const editableSubjectKeys = new Set(editableRiskSubjects.map((subject) => `${subject.type}:${subject.id}`));
  const manageableRisks = dashboardData.risks.filter((risk) => {
    if (signedInUser.role !== 'hr' && ledProjectIds.has(risk.projectId)) return true;
    if (risk.ownerId !== signedInUser.id) return false;
    return (risk.keyResultId && editableSubjectKeys.has(`key_result:${risk.keyResultId}`))
      || (risk.objectiveId && editableSubjectKeys.has(`objective:${risk.objectiveId}`));
  });
  const matrixProjects = dashboardData.projects.filter((project) => mode === 'supabase' || can(signedInUser, 'okr.read_summary', project).allowed);
  const matrixProjectId = matrixProjects.some((project) => project.id === selectedMatrixProjectId)
    ? selectedMatrixProjectId
    : matrixProjects[0]?.id ?? '';
  const selectedProjectMatrixData = { ...dashboardData, risks: readableRisks.filter((risk) => risk.projectId === matrixProjectId) };
  const showFullMatrix = searchParams.get('view') === 'risk-matrix';

  const loadEligibleUsers = async (): Promise<OrganizationUser[]> => {
    const result = await dataRepository.listOrganizationUsers();
    return result.ok ? result.data.filter((user) => user.isActive && user.approvalStatus === 'approved') : [];
  };

  const generateObjectiveNumber = (quarter: string): string => {
    const count = dashboardData.objectives.filter((objective) => objective.quarter === quarter).length;
    return `O-${quarter}-${String(count + 1).padStart(3, '0')}`;
  };

  const openCreate = async () => {
    setFormError(undefined);
    setEligibleUsers(await loadEligibleUsers());
    setCreateOpen(true);
  };

  const handleCreate = async (values: ObjectiveFormValues) => {
    setSubmitting(true);
    setFormError(undefined);
    const number = values.number.trim() || generateObjectiveNumber(values.quarter);
    if (mode === 'demo') {
      const projectId = `project-${Date.now()}`;
      const objectiveId = `objective-${Date.now()}`;
      setData((current) => current ? {
        ...current,
        projects: [...current.projects, {
          id: projectId, name: values.name, description: values.description, leaderId: values.leaderId,
          memberIds: [values.leaderId], classification: 'internal', startDate: values.startDate, dueDate: values.dueDate, status: 'on_track',
        }],
        objectives: [...current.objectives, {
          id: objectiveId, projectId, title: values.name, description: values.description, ownerId: values.leaderId,
          progress: 0, status: 'on_track', startDate: values.startDate, dueDate: values.dueDate, classification: 'internal',
          number, quarter: values.quarter, priority: values.priority, okrStatus: 'not_started',
        }],
      } : current);
      setNotice('objective.createSuccess');
      setCreateOpen(false);
      setSubmitting(false);
      return;
    }
    const result = await dataRepository.createObjective({
      name: values.name, number, leaderId: values.leaderId, quarter: values.quarter,
      startDate: values.startDate, dueDate: values.dueDate, priority: values.priority,
      description: values.description, classification: 'internal',
    });
    setSubmitting(false);
    if (result.ok) {
      setCreateOpen(false);
      setNotice('objective.createSuccess');
      await refresh();
    } else {
      setFormError(t('common.requestFailed'));
    }
  };

  const saveRisk = async (input: RiskEditorInput): Promise<RepositoryResult<{ id: string }>> => {
    setNotice(null);
    if (mode === 'demo') {
      const previewId = input.id ?? `preview-risk-${Date.now()}`;
      setData((current) => current ? {
        ...current,
        risks: [
          ...current.risks.filter((risk) => risk.id !== previewId),
          {
            id: previewId, projectId: input.projectId, keyResultId: input.keyResultId ?? undefined, objectiveId: input.objectiveId ?? undefined,
            title: input.title, description: input.reason, ownerId: signedInUser.id, probability: input.probability, impact: input.impact,
            mitigation: input.mitigation, reason: input.reason, lastReviewedAt: input.lastReviewedAt,
            status: riskStatus(input), classification: input.classification, identifiedAt: input.lastReviewedAt, resolved: input.resolved,
          },
        ],
      } : current);
      setNotice('okr.previewUpdated');
      setActiveEditor(null);
      setEditingRisk(undefined);
      return { ok: true, data: { id: previewId } };
    }
    const result = await dataRepository.saveOwnedRisk(input);
    if (result.ok) {
      await refresh();
      setActiveEditor(null);
      setEditingRisk(undefined);
    }
    return result;
  };

  const resolveRisk = async (risk: Risk) => {
    if (resolvingRiskId) return;
    setResolvingRiskId(risk.id);
    const input: OwnedRiskInput = {
      id: risk.id, projectId: risk.projectId, keyResultId: risk.keyResultId ?? null, objectiveId: risk.objectiveId ?? null,
      title: risk.title, probability: risk.probability, impact: risk.impact, reason: risk.reason ?? risk.description,
      mitigation: risk.mitigation, lastReviewedAt: risk.lastReviewedAt ?? risk.identifiedAt,
      classification: risk.classification, resolved: true,
    };
    if (mode === 'demo') {
      setData((current) => current ? { ...current, risks: current.risks.map((item) => item.id === risk.id ? { ...item, resolved: true, status: 'on_track' } : item) } : current);
      setNotice('okr.previewUpdated');
    } else {
      const result = await dataRepository.saveOwnedRisk(input);
      setNotice(result.ok ? 'okr.riskResolvedNotice' : 'common.requestFailed');
      if (result.ok) await refresh();
    }
    setResolvingRiskId(undefined);
  };

  return (
    <section className="business-page" aria-labelledby="okr-page-title">
      <PageHeader
        title={t('okr.title')}
        description={t('okr.description')}
        primaryAction={canCreateObjective(signedInUser) ? { label: t('okr.createObjective'), onClick: () => void openCreate() } : undefined}
      >
        {editableRiskSubjects.length > 0 ? <button className="button button--secondary" type="button" onClick={() => { setEditingRisk(undefined); setActiveEditor('risk'); }}>{t('okr.newRisk')}</button> : null}
      </PageHeader>
      {notice ? <p className="page-notice" role="status">{t(notice)}</p> : null}
      {activeEditor === 'risk' ? <RiskEditor key={editingRisk?.id ?? 'new-risk'} currentUser={signedInUser} projects={dashboardData.projects} objectives={dashboardData.objectives} keyResults={dashboardData.keyResults} risk={editingRisk} onSave={saveRisk} onCancel={() => { setActiveEditor(null); setEditingRisk(undefined); }} /> : null}

      <div className="filter-row" role="tablist" aria-label={t('okr.title')}>
        {(Object.keys(filterLabels) as ObjectiveFilter[]).map((value) => (
          <button key={value} type="button" role="tab" aria-selected={value === filter} className={`reports-tab${value === filter ? ' reports-tab--active' : ''}`} onClick={() => setFilter(value)}>
            {t(filterLabels[value])}
          </button>
        ))}
      </div>

      {visibleSummaries.length === 0 ? (
        <p className="data-table__empty">{t('okr.noObjectives')}</p>
      ) : (
        <div className="okr-card-grid">
          {visibleSummaries.map((summary) => <ObjectiveCard key={summary.objective.id} summary={summary} users={dashboardData.users} readableKrIds={readableKrIds} />)}
        </div>
      )}

      {signedInUser.role === 'employee' ? (
        <section className="page-section" aria-label={t('okr.myContributions')}>
          <h2>{t('okr.myContributions')}</h2>
          {myContributions.length === 0 ? <p className="data-table__empty">{t('okr.noObjectives')}</p> : myContributions.map(({ keyResult, objective, isCollaborator }) => (
            <article className="form-card okr-my-kr" key={keyResult.id}>
              <h3><Link className="text-link" to={`/okrs/${objective.id}`}>{objective.title}</Link></h3>
              <p>{keyResult.title} {isCollaborator ? <span className="status-badge okr-status-badge">{t('okr.collaboratorBadge')}</span> : null}</p>
              <p className="kr-metric-line">{describeKeyResultMetric(keyResult)} · {t('okr.overallProgress')}：{keyResult.progress}%</p>
              <div className="inline-actions">
                <Link className="button button--secondary" to={`/okrs/${objective.id}`}>{t('okr.viewProject')}</Link>
                <Link className="button button--secondary" to="/reports?tab=daily">{t('okr.writeReport')}</Link>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      <section className="page-section" aria-label={t('okr.relatedEvents')}>
        <div className="filter-row">
          <h2>{t('okr.relatedEvents')}</h2>
          <Link className="button button--secondary" to="/okrs?view=risk-matrix">{t('okr.viewFullMatrix')}</Link>
        </div>
        {showFullMatrix ? (
          <section className="risk-matrix-wrap" role="region" aria-label={t('okr.fullMatrix')}>
            <h3>{t('okr.fullMatrix')}</h3>
            {matrixProjects.length > 0 ? (
              <label className="filter-row">
                <span>{t('okr.matrixProject')}</span>
                <select aria-label={t('okr.matrixProject')} value={matrixProjectId} onChange={(event) => setSelectedMatrixProjectId(event.target.value)}>
                  {matrixProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </label>
            ) : null}
            <Suspense fallback={<p role="status">{t('visualization.loading')}</p>}>
              <RiskMatrixWidget data={selectedProjectMatrixData} />
            </Suspense>
          </section>
        ) : null}
        <DataTable
          ariaLabel={t('okr.manageableRisks')}
          rows={manageableRisks}
          getRowKey={(risk) => risk.id}
          emptyMessage={t('okr.noManageableRisks')}
          columns={[
            { key: 'title', label: t('okr.riskEvent'), render: (risk) => risk.title },
            { key: 'score', label: t('okr.coordinateScore'), render: (risk) => t('okr.coordinateScoreValue', { impact: risk.impact, probability: risk.probability, score: risk.probability * risk.impact }) },
            { key: 'state', label: t('table.status'), render: (risk) => risk.resolved ? t('okr.riskResolved') : t('okr.unresolved') },
            { key: 'actions', label: t('okr.actions'), render: (risk) => <div className="inline-actions">
              <button className="button button--secondary" type="button" onClick={() => { setEditingRisk(risk); setActiveEditor('risk'); }} aria-label={t('okr.editLabel', { title: risk.title })}>{t('okr.edit')}</button>
              {!risk.resolved ? <button className="button button--secondary" type="button" disabled={resolvingRiskId === risk.id} onClick={() => void resolveRisk(risk)} aria-label={t('okr.resolveLabel', { title: risk.title })}>{resolvingRiskId === risk.id ? t('okr.processing') : t('okr.resolve')}</button> : null}
            </div> },
          ]}
        />
      </section>

      {createOpen ? (
        <ObjectiveFormModal
          title={t('objective.createTitle')}
          mode="create"
          initial={{ name: '', number: '', leaderId: '', quarter: '2026-Q3', startDate: '', dueDate: '', priority: 'medium', description: '' }}
          eligibleUsers={eligibleUsers}
          submitting={submitting}
          error={formError}
          onSubmit={(values) => void handleCreate(values)}
          onClose={() => setCreateOpen(false)}
        />
      ) : null}
    </section>
  );
}
