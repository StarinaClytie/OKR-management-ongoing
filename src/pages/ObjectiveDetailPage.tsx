import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissionService';
import { OkrStatusBadge } from '../components/OkrStatusBadge';
import { PageHeader } from '../components/PageHeader';
import { ProgressRing } from '../components/ProgressRing';
import type { OkrRepository, OrganizationUser } from '../data/types';
import { ownersOfKr } from '../domain/krAssignments';
import { deriveObjectiveProgress, describeKeyResultMetric } from '../domain/okrMetrics';
import { canArchiveObjective, canEditObjective, canManageKeyResults, canUpdateKeyResultProgress } from '../domain/okrPermissions';
import { resolveOkrStatus } from '../domain/okrStatus';
import { currentBusinessDate } from '../domain/progressStatus';
import type { KeyResult } from '../domain/types';
import { useLocale } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';
import { repository } from '../lib/supabase';
import type { DashboardData } from '../data/types';
import { AccessDeniedPage } from './AccessDeniedPage';
import { KeyResultFormModal, type KeyResultFormValues } from './okr/KeyResultFormModal';
import { KrProgressUpdateEditor, type KrProgressUpdateInput } from './okr/KrProgressUpdateEditor';
import { ObjectiveFormModal, type ObjectiveFormValues } from './okr/ObjectiveFormModal';

type DetailTab = 'overview' | 'keyResults' | 'reports' | 'timeline';

const priorityKeys: Record<string, MessageKey> = { high: 'priority.high', medium: 'priority.medium', low: 'priority.low' };

const emptyKrForm: KeyResultFormValues = {
  title: '',
  ownerIds: [],
  deadline: '',
  metricType: 'numeric',
  currentValue: undefined,
  targetValue: undefined,
  unit: '',
  percentageCurrent: undefined,
  percentageTarget: undefined,
  milestoneDefinition: '',
  priority: 'medium',
  confidenceIndex: undefined,
  notes: '',
};

export function ObjectiveDetailPage({ dataRepository = repository }: { dataRepository?: OkrRepository }) {
  const { objectiveId } = useParams();
  const { t } = useLocale();
  const { currentUser, mode } = useAuth();
  const [data, setData] = useState<DashboardData | null>(() => currentUser ? dataRepository.getCachedDashboardData?.(currentUser.id) ?? null : null);
  const [loading, setLoading] = useState(mode === 'supabase');
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [krOpen, setKrOpen] = useState(false);
  const [editObjective, setEditObjective] = useState(false);
  const [updatingKrId, setUpdatingKrId] = useState<string | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [eligibleUsers, setEligibleUsers] = useState<OrganizationUser[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);

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
    void refresh();
  }, [currentUser, refresh]);

  const evaluationDate = useMemo(() => currentBusinessDate(), []);
  const objective = data?.objectives.find((candidate) => candidate.id === objectiveId);
  const readable = !objective || mode === 'supabase' || can(currentUser, 'okr.read_detail', objective).allowed;
  const objectiveKrs = useMemo(() => data?.keyResults.filter((keyResult) => keyResult.objectiveId === objectiveId) ?? [], [data, objectiveId]);

  if (!currentUser) return null;
  if (loading && !data) return <section className="business-page"><p role="status">{t('common.loading')}</p></section>;
  if (!objective || !data || !readable) return <AccessDeniedPage />;

  const objectiveData = objective;
  const dashboardData = data;
  const signedInUser = currentUser;
  const overallProgress = deriveObjectiveProgress(objectiveKrs);
  const okrStatus = resolveOkrStatus(objectiveData.okrStatus, overallProgress, objectiveData.startDate, objectiveData.dueDate, evaluationDate);
  const canManage = canManageKeyResults(signedInUser, objectiveData);
  const isArchived = objectiveData.archivedAt != null;
  const objectiveProject = dashboardData.projects.find((project) => project.id === objectiveData.projectId);
  const projectMembers = objectiveProject
    ? dashboardData.users.filter((user) => objectiveProject.memberIds.includes(user.id))
    : dashboardData.users;
  const objectiveUpdates = dashboardData.krProgressUpdates.filter((update) => objectiveKrs.some((keyResult) => keyResult.id === update.krId));
  const projectReports = dashboardData.dailyReports.filter((report) => report.objectiveId === objectiveData.id);

  const loadEligibleUsers = async (): Promise<OrganizationUser[]> => {
    const result = await dataRepository.listOrganizationUsers();
    return result.ok ? result.data.filter((user) => user.isActive && user.approvalStatus === 'approved') : [];
  };

  const closeModals = () => {
    setKrOpen(false);
    setEditObjective(false);
    setArchiveConfirm(false);
    setFormError(undefined);
    setSubmitting(false);
  };

  const handleSaveKeyResult = async (values: KeyResultFormValues) => {
    setSubmitting(true);
    setFormError(undefined);
    const notes = values.metricType === 'milestone' ? values.milestoneDefinition : values.notes;
    const currentValue = values.metricType === 'numeric' ? values.currentValue : values.metricType === 'percentage' ? values.percentageCurrent : undefined;
    const targetValue = values.metricType === 'numeric' ? values.targetValue : values.metricType === 'percentage' ? values.percentageTarget : undefined;
    const result = await dataRepository.createKeyResult({
      objectiveId: objectiveData.id,
      title: values.title,
      ownerIds: values.ownerIds,
      dueDate: values.deadline,
      metricType: values.metricType,
      currentValue,
      targetValue,
      unit: values.unit,
      notes,
      confidenceIndex: values.confidenceIndex,
      priority: values.priority,
      classification: objectiveData.classification,
    });
    setSubmitting(false);
    if (result.ok) {
      setKrOpen(false);
      setNotice('kr.createSuccess');
      await refresh();
    } else {
      setFormError(t('common.requestFailed'));
    }
  };

  const handleSaveProgressUpdate = async (keyResult: KeyResult, input: KrProgressUpdateInput) => {
    const result = await dataRepository.saveKrProgressUpdate({
      keyResultId: keyResult.id,
      previousProgress: keyResult.progress,
      newProgress: input.newProgress,
      summary: input.summary,
      blocker: input.blocker,
      reason: input.reason,
      nextAction: input.nextAction,
      evidence: input.evidence,
    });
    if (result.ok) {
      setNotice('krProgress.saved');
      setUpdatingKrId(null);
      await refresh();
    } else {
      setNotice('common.requestFailed');
    }
  };

  const handleArchiveObjective = async () => {
    setSubmitting(true);
    const result = isArchived ? await dataRepository.restoreObjective(objectiveData.id) : await dataRepository.archiveObjective(objectiveData.id);
    setSubmitting(false);
    setArchiveConfirm(false);
    if (result.ok) {
      setNotice(isArchived ? 'objective.restoreSuccess' : 'objective.archiveSuccess');
      await refresh();
    } else {
      setNotice('common.requestFailed');
    }
  };

  const handleEditObjective = async (values: ObjectiveFormValues) => {
    setSubmitting(true);
    setFormError(undefined);
    const result = await dataRepository.updateObjective({
      objectiveId: objectiveData.id,
      name: values.name,
      number: values.number,
      leaderId: values.leaderId,
      quarter: values.quarter,
      startDate: values.startDate,
      dueDate: values.dueDate,
      priority: values.priority,
      description: values.description,
      classification: objectiveData.classification,
    });
    setSubmitting(false);
    if (result.ok) {
      setEditObjective(false);
      setNotice('objective.updateSuccess');
      await refresh();
    } else {
      setFormError(t('common.requestFailed'));
    }
  };

  const openEditObjective = async () => {
    setFormError(undefined);
    setEligibleUsers(await loadEligibleUsers());
    setEditObjective(true);
  };

  return (
    <section className="business-page" aria-labelledby="objective-detail-title">
      <Link className="text-link" to="/okrs">{t('objective.backToOkr')}</Link>
      <PageHeader
        title={objectiveData.title}
        description={objectiveData.description}
        primaryAction={canManage ? { label: t('objective.addKeyResult'), onClick: () => { setFormError(undefined); setKrOpen(true); } } : undefined}
      >
        {canEditObjective(signedInUser, objectiveData) ? <button className="button button--secondary" type="button" onClick={() => void openEditObjective()}>{t('okr.editObjective')}</button> : null}
        {canArchiveObjective(signedInUser) ? <button className="button button--secondary" type="button" onClick={() => setArchiveConfirm(true)}>{isArchived ? t('okr.restore') : t('okr.archive')}</button> : null}
      </PageHeader>

      {notice ? <p className="page-notice" role="status">{t(notice)}</p> : null}
      {isArchived ? <p className="page-notice" role="status">{t('okr.archivedBadge')}</p> : null}

      <dl className="project-detail__meta">
        <dt>{t('okr.projectNumber')}</dt>
        <dd>{objectiveData.number ?? '—'}</dd>
        <dt>{t('objective.owner')}</dt>
        <dd>{dashboardData.users.find((user) => user.id === objectiveData.ownerId)?.name ?? '—'}</dd>
        <dt>{t('objective.period')}</dt>
        <dd>{objectiveData.startDate} — {objectiveData.dueDate}</dd>
        <dt>{t('okr.quarterLabel')}</dt>
        <dd>{objectiveData.quarter ?? '—'}</dd>
        <dt>{t('okr.overallProgress')}</dt>
        <dd><ProgressRing value={overallProgress} size="small" /></dd>
        <dt>{t('table.status')}</dt>
        <dd><OkrStatusBadge status={okrStatus} /></dd>
      </dl>

      <div className="filter-row" role="tablist" aria-label={objectiveData.title}>
        {(['overview', 'keyResults', 'reports', 'timeline'] as const).map((tab) => (
          <button key={tab} type="button" role="tab" aria-selected={tab === activeTab} className={`reports-tab${tab === activeTab ? ' reports-tab--active' : ''}`} onClick={() => setActiveTab(tab)}>
            {t(tab === 'overview' ? 'objective.overview' : tab === 'keyResults' ? 'objective.keyResults' : tab === 'reports' ? 'objective.reports' : 'objective.timeline')}
          </button>
        ))}
      </div>

      {activeTab === 'overview' ? (
        <section className="page-section" role="tabpanel" aria-label={t('objective.overview')}>
          <div className="form-card form-section">
            <h2>{t('objective.overview')}</h2>
            <p>{objectiveData.description || t('objective.descriptionLabel')}</p>
            {objectiveData.priority ? <p>{t('objective.field.priority')}：{t(priorityKeys[objectiveData.priority])}</p> : null}
            <p>{t('okr.krBreakdown')}：{objectiveKrs.length} 项 · {t('okr.updatesCount', { count: objectiveUpdates.length })}</p>
          </div>
        </section>
      ) : null}

      {activeTab === 'keyResults' ? (
        <section className="page-section" role="tabpanel" aria-label={t('objective.keyResults')}>
          {objectiveKrs.length === 0 ? <p className="data-table__empty">{t('objective.noKeyResults')}</p> : objectiveKrs.map((keyResult) => {
            const ownerIds = ownersOfKr(keyResult.id, dashboardData.krAssignments);
            const ownerId = keyResult.ownerId || ownerIds[0];
            const history = dashboardData.krProgressUpdates.filter((update) => update.krId === keyResult.id).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
            const canUpdate = canUpdateKeyResultProgress(signedInUser, objectiveData, keyResult, dashboardData.krAssignments);
            return (
              <article className="form-card" key={keyResult.id}>
                <div className="filter-row">
                  <h3>{keyResult.title}</h3>
                  <OkrStatusBadge status={resolveOkrStatus(keyResult.okrStatus, keyResult.progress, keyResult.startDate, keyResult.dueDate, evaluationDate)} />
                </div>
                <p className="kr-metric-line">
                  <strong>{t('kr.owner')}：</strong>{ownerIds.length > 0 ? ownerIds.map((id) => dashboardData.users.find((user) => user.id === id)?.name ?? '—').join('、') : dashboardData.users.find((user) => user.id === ownerId)?.name ?? '—'}
                </p>
                <p className="kr-metric-line">{describeKeyResultMetric(keyResult)} · {t('kr.field.deadline')}：{keyResult.dueDate}</p>
                <div className="filter-row">
                  <ProgressRing value={keyResult.progress} size="small" />
                  {canUpdate ? <button className="button button--secondary" type="button" onClick={() => setUpdatingKrId(keyResult.id)}>{t('kr.updateProgress')}</button> : null}
                  <Link className="button button--secondary" to={`/reports?tab=daily&objectiveId=${objectiveData.id}&krId=${keyResult.id}`}>{t('okr.writeReport')}</Link>
                </div>
                {updatingKrId === keyResult.id ? (
                  <KrProgressUpdateEditor
                    currentProgress={keyResult.progress}
                    onSubmit={(input) => void handleSaveProgressUpdate(keyResult, input)}
                    onCancel={() => setUpdatingKrId(null)}
                  />
                ) : null}
                <section aria-label={t('kr.progressHistory')}>
                  <h4>{t('kr.progressHistory')}</h4>
                  {history.length === 0 ? <p>{t('kr.noProgressHistory')}</p> : (
                    <ul className="kr-history">
                      {history.map((update) => (
                        <li key={update.id}>
                          <span>{update.createdAt.slice(0, 10)}</span>
                          <span>{t('krProgress.fromTo', { from: update.previousProgress, to: update.newProgress })}</span>
                          <p>{update.summary}</p>
                          {update.evidence ? <p>{t('krProgress.evidence')}：{update.evidence}</p> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </article>
            );
          })}
        </section>
      ) : null}

      {activeTab === 'reports' ? (
        <section className="page-section" role="tabpanel" aria-label={t('objective.reports')}>
          {projectReports.length === 0 ? <p className="data-table__empty">{t('objective.reportsEmpty')}</p> : (
            <ul className="member-list">
              {projectReports.map((report) => (
                <li key={report.id} className="member-list__row">
                  <div className="member-list__identity">
                    <span className="member-list__name">{report.date} · {dashboardData.users.find((user) => user.id === report.authorId)?.name ?? '—'}</span>
                    <span className="member-list__meta">{t('common.hours', { count: report.hours })}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {activeTab === 'timeline' ? (
        <section className="page-section" role="tabpanel" aria-label={t('objective.timeline')}>
          <p className="data-table__empty">{t('objective.timelinePlaceholder')}</p>
        </section>
      ) : null}

      {krOpen ? (
        <KeyResultFormModal
          title={t('kr.createTitle')}
          initial={{ ...emptyKrForm, deadline: objectiveData.dueDate }}
          members={projectMembers}
          submitting={submitting}
          error={formError}
          onSubmit={(values) => void handleSaveKeyResult(values)}
          onClose={closeModals}
        />
      ) : null}

      {editObjective ? (
        <ObjectiveFormModal
          title={t('objective.editTitle')}
          mode="edit"
          initial={{
            name: objectiveData.title,
            number: objectiveData.number ?? '',
            leaderId: objectiveData.ownerId,
            quarter: objectiveData.quarter ?? '',
            startDate: objectiveData.startDate,
            dueDate: objectiveData.dueDate,
            priority: objectiveData.priority ?? 'medium',
            description: objectiveData.description,
          }}
          eligibleUsers={eligibleUsers}
          submitting={submitting}
          error={formError}
          onSubmit={(values) => void handleEditObjective(values)}
          onClose={closeModals}
        />
      ) : null}

      {archiveConfirm ? (
        <div className="modal-scrim" onClick={(event) => { if (event.target === event.currentTarget) setArchiveConfirm(false); }}>
          <div className="modal-panel" role="dialog" aria-modal="true" aria-label={t('okr.archiveConfirmTitle')}>
            <h2>{isArchived ? t('okr.restore') : t('okr.archiveConfirmTitle')}</h2>
            <p>{t('okr.archiveConfirmBody')}</p>
            <p className="users-delete-target">{objectiveData.title}</p>
            <div className="modal-actions">
              <button type="button" className="button button--secondary" onClick={() => setArchiveConfirm(false)}>{t('common.cancel')}</button>
              <button type="button" className="button button--danger" disabled={submitting} onClick={() => void handleArchiveObjective()}>
                {submitting ? t('common.saving') : isArchived ? t('okr.restore') : t('okr.confirmArchive')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
