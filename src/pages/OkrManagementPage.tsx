import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissionService';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { ProgressRing } from '../components/ProgressRing';
import { StatusBadge } from '../components/StatusBadge';
import { StatusExplanation } from '../components/StatusExplanation';
import type { OkrRepository, OwnedRiskInput, RepositoryResult } from '../data/types';
import { deriveExecutionStatuses } from '../domain/progressStatus';
import type { Risk } from '../domain/types';
import { repository } from '../lib/supabase';
import { mockRepository, type DashboardData } from '../mocks/repository';
import { KrProgressEditor } from './KrProgressEditor';
import { getEditableRiskSubjects, RiskEditor, type RiskEditorInput } from './RiskEditor';
import { useLocale } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';

const RiskMatrixWidget = lazy(async () => {
  const module = await import('../dashboard/widgets/RiskMatrixWidget');
  return { default: module.RiskMatrixWidget };
});

function riskStatus(input: Pick<OwnedRiskInput, 'probability' | 'impact' | 'resolved'>): Risk['status'] {
  if (input.resolved) return 'on_track';
  const score = input.probability * input.impact;
  return score === 9 ? 'off_track' : score >= 6 ? 'at_risk' : 'on_track';
}

export function OkrManagementPage({ dataRepository = repository }: { dataRepository?: OkrRepository }) {
  const { t } = useLocale();
  const { currentUser, mode } = useAuth();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<DashboardData | null>(() => currentUser && mode === 'demo'
    ? mockRepository.getDashboardData(currentUser.id)
    : null);
  const [loading, setLoading] = useState(mode === 'supabase');
  const [loadError, setLoadError] = useState<MessageKey | null>(null);
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const [activeEditor, setActiveEditor] = useState<'progress' | 'risk' | null>(null);
  const [editingRisk, setEditingRisk] = useState<Risk | undefined>();
  const [resolvingRiskId, setResolvingRiskId] = useState<string>();
  const [selectedMatrixProjectId, setSelectedMatrixProjectId] = useState('');

  const refresh = useCallback(async (): Promise<boolean> => {
    if (!currentUser) return false;
    setLoading(true);
    try {
      const result = await dataRepository.getDashboardData(currentUser.id);
      if (!result.ok) {
        setLoadError('common.requestFailed');
        return false;
      }
      setLoadError(null);
      setData(result.data);
      return true;
    } catch {
      setLoadError('common.requestFailed');
      return false;
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

  const editableRiskSubjects = useMemo(() => currentUser && data
    ? getEditableRiskSubjects(currentUser, data.projects, data.objectives, data.keyResults)
    : [], [currentUser, data]);

  if (!currentUser) return null;
  if (loading && !data) return <p role="status">{t('okr.loading')}</p>;
  if (loadError && !data) return <p role="alert">{t(loadError)}</p>;
  if (!data) return null;
  const dashboardData = data;
  const signedInUser = currentUser;
  const readableRisks = mode === 'supabase'
    ? dashboardData.risks
    : dashboardData.risks.filter((risk) => can(signedInUser, 'risk.read', risk).allowed);
  const executionStatuses = deriveExecutionStatuses({ ...dashboardData, risks: readableRisks });
  const derivedKeyResults = dashboardData.keyResults.map((keyResult) => ({
    ...keyResult,
    status: executionStatuses.keyResults.get(keyResult.id)?.status ?? keyResult.status,
  }));

  const keyResults = mode === 'supabase'
    ? derivedKeyResults
    : derivedKeyResults.filter((keyResult) => can(signedInUser, 'okr.read_detail', keyResult).allowed);
  const ownKeyResults = keyResults.filter((keyResult) => keyResult.ownerId === currentUser.id);
  const ledProjectIds = new Set(data.projects.filter((project) => project.leaderId === currentUser.id).map((project) => project.id));
  const editableSubjectKeys = new Set(editableRiskSubjects.map((subject) => `${subject.type}:${subject.id}`));
  const manageableRisks = data.risks.filter((risk) => {
    if (currentUser.role !== 'hr' && ledProjectIds.has(risk.projectId)) return true;
    if (risk.ownerId !== currentUser.id) return false;
    return (risk.keyResultId && editableSubjectKeys.has(`key_result:${risk.keyResultId}`))
      || (risk.objectiveId && editableSubjectKeys.has(`objective:${risk.objectiveId}`));
  });
  const matrixProjects = dashboardData.projects.filter((project) => (
    mode === 'supabase' || can(signedInUser, 'okr.read_summary', project).allowed
  ));
  const matrixProjectId = matrixProjects.some((project) => project.id === selectedMatrixProjectId)
    ? selectedMatrixProjectId
    : matrixProjects[0]?.id ?? '';
  const selectedProjectMatrixData = {
    ...dashboardData,
    risks: readableRisks.filter((risk) => risk.projectId === matrixProjectId),
  };
  const showFullMatrix = searchParams.get('view') === 'risk-matrix';

  async function saveProgress(input: Parameters<OkrRepository['saveKrProgress']>[0]) {
    setNotice(null);
    if (mode === 'demo') {
      setData((current) => current ? {
        ...current,
        keyResults: current.keyResults.map((item) => item.id === input.keyResultId
          ? { ...item, progress: input.progress, status: input.progress === 100 ? 'complete' : 'on_track' }
          : item),
        progressSnapshots: [...current.progressSnapshots, {
          id: `preview-${Date.now()}`,
          projectId: current.objectives.find((objective) => objective.id === current.keyResults.find((item) => item.id === input.keyResultId)?.objectiveId)?.projectId ?? '',
          keyResultId: input.keyResultId,
          weekOf: input.effectiveDate,
          actual: input.progress,
          planned: current.progressSnapshots.filter((item) => item.keyResultId === input.keyResultId).at(-1)?.planned ?? input.progress,
        }],
      } : current);
      setNotice('okr.previewUpdated');
      setActiveEditor(null);
      return { ok: true, data: { snapshotId: 'demo-preview' } } as const;
    }
    const result = await dataRepository.saveKrProgress(input);
    if (result.ok) {
      const reloaded = await refresh();
      setNotice(reloaded ? 'okr.progressSaved' : 'okr.progressSavedStale');
      setActiveEditor(null);
    }
    return result;
  }

  async function saveRisk(input: RiskEditorInput): Promise<RepositoryResult<{ id: string }>> {
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
      const reloaded = await refresh();
      setNotice(reloaded ? 'okr.riskSaved' : 'okr.riskSavedStale');
      setActiveEditor(null);
      setEditingRisk(undefined);
    }
    return result;
  }

  async function resolveRisk(risk: Risk) {
    if (resolvingRiskId) return;
    setResolvingRiskId(risk.id);
    const input: OwnedRiskInput = {
      id: risk.id, projectId: risk.projectId, keyResultId: risk.keyResultId ?? null, objectiveId: risk.objectiveId ?? null,
      title: risk.title, probability: risk.probability, impact: risk.impact, reason: risk.reason ?? risk.description,
      mitigation: risk.mitigation, lastReviewedAt: risk.lastReviewedAt ?? risk.identifiedAt,
      classification: risk.classification, resolved: true,
    };
    try {
      if (mode === 'demo') {
        setData((current) => current ? { ...current, risks: current.risks.map((item) => item.id === risk.id ? { ...item, resolved: true, status: 'on_track' } : item) } : current);
        setNotice('okr.previewUpdated');
      } else {
        const result = await dataRepository.saveOwnedRisk(input);
        if (result.ok) {
          const reloaded = await refresh();
          setNotice(reloaded ? 'okr.riskResolvedNotice' : 'okr.riskResolvedStale');
        } else setNotice('common.requestFailed');
      }
    } catch {
      setNotice('common.requestFailed');
    } finally {
      setResolvingRiskId(undefined);
    }
  }

  return (
    <section className="business-page" aria-labelledby="okr-page-title">
      <PageHeader
        title={t('okr.title')}
        description={t('okr.description')}
        primaryAction={ownKeyResults.length > 0 ? { label: t('okr.updateMine'), onClick: () => { setEditingRisk(undefined); setActiveEditor('progress'); } } : undefined}
      >
        {editableRiskSubjects.length > 0 && <button className="button button--secondary" type="button" onClick={() => { setEditingRisk(undefined); setActiveEditor('risk'); }}>{t('okr.newRisk')}</button>}
      </PageHeader>
      {notice && <p className="page-notice" role="status">{t(notice)}</p>}
      {loadError && <p role="alert">{t(loadError)}</p>}
      {activeEditor === 'progress' && <KrProgressEditor ownerId={currentUser.id} keyResults={keyResults} onSave={saveProgress} onCancel={() => setActiveEditor(null)} />}
      {activeEditor === 'risk' && <RiskEditor
        key={editingRisk?.id ?? 'new-risk'} currentUser={currentUser} projects={data.projects} objectives={data.objectives} keyResults={data.keyResults}
        risk={editingRisk} onSave={saveRisk} onCancel={() => { setActiveEditor(null); setEditingRisk(undefined); }}
      />}
      <div className="filter-row"><span>{t('okr.currentScope')}</span><strong>{currentUser.department}</strong><button className="button button--secondary" type="button">{t('projects.moreFilters')}</button></div>
      <DataTable
        ariaLabel={t('okr.authorizedKrs')}
        rows={keyResults}
        getRowKey={(keyResult) => keyResult.id}
        emptyMessage={t('okr.empty')}
        columns={[
          { key: 'title', label: t('okr.keyResult'), render: (keyResult) => keyResult.title },
          { key: 'progress', label: t('okr.progress'), render: (keyResult) => <ProgressRing value={keyResult.progress} size="small" /> },
          { key: 'status', label: t('table.status'), render: (keyResult) => <StatusBadge status={keyResult.status} /> },
          { key: 'owner', label: t('table.owner'), render: (keyResult) => data.users.find((user) => user.id === keyResult.ownerId)?.name ?? '—' },
        ]}
      />
      {ownKeyResults.length > 0 && <section className="page-section" aria-label={t('okr.myStatus')}>
        <h2>{t('okr.myStatus')}</h2>
        {ownKeyResults.map((keyResult) => {
          const attachedRisks = dashboardData.risks.filter((risk) => (
            risk.keyResultId === keyResult.id || risk.objectiveId === keyResult.objectiveId
          ) && (mode === 'supabase' || can(signedInUser, 'risk.read', risk).allowed));
          return <article className="form-card" key={keyResult.id}>
            <h3>{keyResult.title}</h3>
            <StatusExplanation result={executionStatuses.keyResults.get(keyResult.id) ?? { status: keyResult.status, reasons: [] }} />
            <section aria-label={t('okr.relatedRiskLabel', { title: keyResult.title })}>
              <h4>{t('okr.relatedRisks')}</h4>
              {attachedRisks.length > 0
                ? <ul>{attachedRisks.map((risk) => <li key={risk.id}><strong>{risk.title}</strong> · {risk.resolved ? t('okr.riskResolved') : `${risk.probability} × ${risk.impact} = ${risk.probability * risk.impact}`}</li>)}</ul>
                : <p>{t('okr.noRelatedRisk')}</p>}
            </section>
          </article>;
        })}
      </section>}
      <section className="page-section" aria-label={t('okr.relatedEvents')}>
        <div className="filter-row"><h2>{t('okr.relatedEvents')}</h2><Link className="button button--secondary" to="/okrs?view=risk-matrix">{t('okr.viewFullMatrix')}</Link></div>
        {showFullMatrix && <section className="risk-matrix-wrap" role="region" aria-label={t('okr.fullMatrix')}>
          <h3>{t('okr.fullMatrix')}</h3>
          {matrixProjects.length > 0 && <label className="filter-row">
            <span>{t('okr.matrixProject')}</span>
            <select aria-label={t('okr.matrixProject')} value={matrixProjectId} onChange={(event) => setSelectedMatrixProjectId(event.target.value)}>
              {matrixProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>}
          <Suspense fallback={<p role="status">{t('visualization.loading')}</p>}>
            <RiskMatrixWidget data={selectedProjectMatrixData} />
          </Suspense>
        </section>}
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
              {!risk.resolved && <button className="button button--secondary" type="button" disabled={resolvingRiskId === risk.id} onClick={() => void resolveRisk(risk)} aria-label={t('okr.resolveLabel', { title: risk.title })}>{resolvingRiskId === risk.id ? t('okr.processing') : t('okr.resolve')}</button>}
            </div> },
          ]}
        />
      </section>
    </section>
  );
}
