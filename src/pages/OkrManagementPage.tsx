import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissionService';
import { EmptyState } from '../components/EmptyState';
import { OkrStatusBadge } from '../components/OkrStatusBadge';
import { PageHeader } from '../components/PageHeader';
import { ProgressRing } from '../components/ProgressRing';
import type { OkrRepository, OrganizationUser } from '../data/types';
import { isKrOwner, ownersOfKr } from '../domain/krAssignments';
import { filterObjectiveSummaries, summarizeObjective, type ObjectiveFilter, type ObjectiveSummary } from '../domain/objectivePortfolio';
import { describeKeyResultMetric } from '../domain/okrMetrics';
import { canCreateObjective } from '../domain/okrPermissions';
import { currentBusinessDate } from '../domain/progressStatus';
import { useLocale } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';
import { repository } from '../lib/supabase';
import type { DashboardData } from '../data/types';
import { ObjectiveFormModal, type ObjectiveFormValues } from './okr/ObjectiveFormModal';

const filterLabels: Record<ObjectiveFilter, MessageKey> = {
  all: 'okr.all',
  mine: 'okr.myProjects',
  myKrs: 'okr.myKrs',
};

function ownerNames(userIds: string[], fallbackUserId: string | undefined, users: DashboardData['users']): string {
  const ids = userIds.length > 0 ? userIds : (fallbackUserId ? [fallbackUserId] : []);
  const names = ids.map((id) => users.find((user) => user.id === id)?.name ?? '—');
  return names.join('、');
}

export function ObjectiveTreeNode({ summary, users, readableKrIds, krAssignments }: { summary: ObjectiveSummary; users: DashboardData['users']; readableKrIds: ReadonlySet<string>; krAssignments: DashboardData['krAssignments'] }) {
  const { t } = useLocale();
  const { objective, keyResults, overallProgress, okrStatus } = summary;
  const leaderName = users.find((user) => user.id === objective.ownerId)?.name ?? '—';
  const visibleKeyResults = keyResults.filter((keyResult) => readableKrIds.has(keyResult.id));

  return (
    <li className="okr-tree__objective">
      <article className="okr-tree-node okr-tree-node--objective">
        <div className="okr-tree-node__main">
          <p className="okr-tree-node__number">{objective.number ?? '—'}</p>
          <Link className="okr-tree-node__title" to={`/okrs/${objective.id}`}>{objective.title}</Link>
          <p className="okr-tree-node__meta">{t('okr.projectLead')}：{leaderName}</p>
        </div>
        <div className="okr-tree-node__progress">
          <ProgressRing value={overallProgress} size="small" />
          <OkrStatusBadge status={okrStatus} />
        </div>
      </article>
      <ul className="okr-tree__krs">
        {visibleKeyResults.map((keyResult) => (
          <li key={keyResult.id} className="okr-tree__kr">
            <article className="okr-tree-node okr-tree-node--kr">
              <div className="okr-tree-node__main">
                <span className="okr-tree-node__kr-title">{keyResult.title}</span>
                <p className="okr-tree-node__meta">{t('kr.owner')}：{ownerNames(ownersOfKr(keyResult.id, krAssignments), keyResult.ownerId, users)}</p>
              </div>
              <div className="okr-tree-node__progress">
                <span className="okr-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={keyResult.progress} aria-label={keyResult.title}>
                  <span className="okr-progress-fill" style={{ width: `${keyResult.progress}%` }} />
                </span>
                <span className="okr-tree-node__value">{keyResult.progress}%</span>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </li>
  );
}

export function OkrManagementPage({ dataRepository = repository }: { dataRepository?: OkrRepository }) {
  const { t } = useLocale();
  const { currentUser, mode } = useAuth();
  const [data, setData] = useState<DashboardData | null>(() => currentUser ? dataRepository.getCachedDashboardData?.(currentUser.id) ?? null : null);
  const [loading, setLoading] = useState(mode === 'supabase');
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const [filter, setFilter] = useState<ObjectiveFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);
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
  const summaries = useMemo(() => {
    if (!data) return [];
    const readable = data.objectives
      .filter((objective) => objective.archivedAt == null)
      .filter((objective) => mode === 'supabase' || can(currentUser, 'okr.read_summary', objective).allowed);
    return readable.map((objective) => summarizeObjective(objective, data.keyResults, data.krProgressUpdates, evaluationDate));
  }, [data, currentUser, mode, evaluationDate]);

  const visibleSummaries = useMemo(() => currentUser && data
    ? filterObjectiveSummaries(filter, summaries, currentUser, data.krAssignments)
    : [], [filter, summaries, currentUser, data]);

  const myContributions = useMemo(() => {
    if (!currentUser || !data || currentUser.role === 'hr') return [];
    return summaries.flatMap((summary) => summary.keyResults
      .filter((keyResult) => isKrOwner(currentUser.id, keyResult.id, data.krAssignments))
      .map((keyResult) => ({ keyResult, objective: summary.objective })));
  }, [summaries, currentUser, data]);

  const readableKrIds = useMemo(() => {
    if (!data) return new Set<string>();
    if (mode === 'supabase') return new Set(data.keyResults.map((keyResult) => keyResult.id));
    return new Set(data.keyResults.filter((keyResult) => can(currentUser, 'okr.read_detail', keyResult).allowed).map((keyResult) => keyResult.id));
  }, [data, currentUser, mode]);

  if (!currentUser) return null;
  if (loading && !data) return <section className="business-page"><p role="status">{t('okr.loading')}</p></section>;
  if (!data) return null;

  const signedInUser = currentUser;
  const dashboardData = data;

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
    const result = await dataRepository.createObjective({
      name: values.name, number, leaderId: values.leaderId, quarter: values.quarter,
      startDate: values.startDate, dueDate: values.dueDate, priority: values.priority,
      description: values.description, classification: 'internal',
      objectiveType: values.objectiveType, hrOwnerIds: values.hrOwnerIds,
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

  return (
    <section className="business-page" aria-labelledby="okr-page-title">
      <PageHeader
        title={t('okr.title')}
        description={t('okr.description')}
        primaryAction={canCreateObjective(signedInUser) ? { label: t('okr.createObjective'), onClick: () => void openCreate() } : undefined}
      />
      {notice ? <p className="page-notice" role="status">{t(notice)}</p> : null}

      <div className="filter-row" role="tablist" aria-label={t('okr.title')}>
        {(Object.keys(filterLabels) as ObjectiveFilter[]).map((value) => (
          <button key={value} type="button" role="tab" aria-selected={value === filter} className={`reports-tab${value === filter ? ' reports-tab--active' : ''}`} onClick={() => setFilter(value)}>
            {t(filterLabels[value])}
          </button>
        ))}
      </div>

      {visibleSummaries.length === 0 ? (
        <EmptyState
          title={t('okr.emptyTitle')}
          description={canCreateObjective(signedInUser) ? t('okr.emptyCreateDescription') : t('okr.emptyWaitDescription')}
          primaryAction={canCreateObjective(signedInUser) ? { label: t('okr.createObjective'), onClick: () => void openCreate() } : undefined}
        />
      ) : (
        <ul className="okr-tree">
          {visibleSummaries.map((summary) => (
            <ObjectiveTreeNode key={summary.objective.id} summary={summary} users={dashboardData.users} readableKrIds={readableKrIds} krAssignments={dashboardData.krAssignments} />
          ))}
        </ul>
      )}

      {signedInUser.role === 'employee' ? (
        <section className="page-section" aria-label={t('okr.myContributions')}>
          <h2>{t('okr.myContributions')}</h2>
          {myContributions.length === 0 ? <p className="data-table__empty">{t('okr.noObjectives')}</p> : myContributions.map(({ keyResult, objective }) => (
            <article className="form-card okr-my-kr" key={keyResult.id}>
              <h3><Link className="text-link" to={`/okrs/${objective.id}`}>{objective.title}</Link></h3>
              <p>{keyResult.title}</p>
              <p className="kr-metric-line">{describeKeyResultMetric(keyResult)} · {t('okr.overallProgress')}：{keyResult.progress}%</p>
              <div className="inline-actions">
                <Link className="button button--secondary" to={`/okrs/${objective.id}`}>{t('okr.viewProject')}</Link>
                <Link className="button button--secondary" to={`/reports?tab=daily&objectiveId=${objective.id}&krId=${keyResult.id}`}>{t('okr.writeReport')}</Link>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {createOpen ? (
        <ObjectiveFormModal
          title={t('objective.createTitle')}
          mode="create"
          initial={{ name: '', number: '', leaderId: '', quarter: '2026-Q3', startDate: '', dueDate: '', priority: 'medium', description: '', objectiveType: 'business', hrOwnerIds: [] }}
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
