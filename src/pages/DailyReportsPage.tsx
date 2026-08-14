import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissionService';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { toLocalDailyReport, type DailyEvidenceDraft, type DailyReportDraft } from '../domain/dailyEntry';
import { getDailyEvidencePermissionScope, getDailyReportBodyPermissionScope } from '../domain/permissions';
import type { Classification, DailyReport, Objective, User } from '../domain/types';
import { mockRepository } from '../mocks/repository';
import { DailyReportForm } from './daily-report/DailyReportForm';
import { dailyReportToDraft } from '../data/dailyReportMapper';
import { appMode, repository } from '../lib/supabase';
import { RevisionHistory, type RevisionSummary } from './daily-report/RevisionHistory';
import { DailyReportEvidenceDetails } from './DailyReportEvidenceDetails';
import { useLocale } from '../i18n/LocaleProvider';
import type { LocalizedMessage, MessageKey } from '../i18n/messages';

function authorName(authorId: string, users: ReturnType<typeof mockRepository.getDashboardData>['users'], fallback: string) {
  return users.find((user) => user.id === authorId)?.name ?? fallback;
}

const classificationLabels: Record<Classification, MessageKey> = {
  public: 'classification.public',
  internal: 'classification.internal',
  confidential: 'classification.confidential',
  restricted: 'classification.restricted',
};
const classificationRank: Record<Classification, number> = { public: 0, internal: 1, confidential: 2, restricted: 3 };

function authorizedEvidence(viewer: User, report: DailyReport): DailyEvidenceDraft[] {
  const items = report.evidenceItems ?? report.evidence.map((label, index) => ({ id: `legacy-${index + 1}`, label, kind: 'link' as const, classification: report.evidenceClassification }));
  return items.filter((item) => can(viewer, 'evidence.read', getDailyEvidencePermissionScope(report, item)).allowed);
}

function authoringResource(authorId: string, objective: Objective): DailyReport {
  return {
    id: `authoring-${authorId}-${objective.id}`,
    authorId,
    projectId: objective.projectId,
    objectiveId: objective.id,
    keyResultIds: [],
    date: '2026-08-11',
    content: '',
    classification: objective.classification,
    hours: 0,
    evidence: [],
    evidenceClassification: 'public',
    attachmentIds: [],
    status: 'draft',
  };
}

export function resolveDailyAuthoringContext(
  currentUser: User,
  ownReports: readonly DailyReport[],
  linkableObjectives: readonly Objective[],
): { report: DailyReport; objective: Objective } | undefined {
  for (const report of ownReports) {
    const objective = linkableObjectives.find(
      (candidate) => candidate.id === report.objectiveId && candidate.projectId === report.projectId,
    );
    if (objective && can(currentUser, 'daily_report.create', report).allowed) return { report, objective };
  }

  for (const report of ownReports) {
    const objective = linkableObjectives.find((candidate) => candidate.projectId === report.projectId);
    if (objective && can(currentUser, 'daily_report.create', report).allowed) return { report, objective };
  }

  return linkableObjectives
    .map((objective) => ({ report: authoringResource(currentUser.id, objective), objective }))
    .find((candidate) => can(currentUser, 'daily_report.create', candidate.report).allowed);
}

export function DailyReportsPage() {
  const { t } = useLocale();
  const { currentUser } = useAuth();
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const [isAuthoring, setIsAuthoring] = useState(false);
  const [editingReport, setEditingReport] = useState<DailyReport>();
  const [revisions, setRevisions] = useState<RevisionSummary[]>([]);
  const [localReports, setLocalReports] = useState<{ ownerId: string | undefined; reports: DailyReport[] }>(() => ({ ownerId: currentUser?.id, reports: [] }));
  const nextLocalSubmissionNonce = useRef(1);
  const authoringButtonRef = useRef<HTMLButtonElement>(null);
  const authoringHeadingRef = useRef<HTMLHeadingElement>(null);
  const restoreAuthoringFocus = useRef(false);
  useEffect(() => {
    setIsAuthoring(false);
    setEditingReport(undefined);
    setRevisions([]);
    setLocalReports({ ownerId: currentUser?.id, reports: [] });
    setNotice(null);
    nextLocalSubmissionNonce.current = 1;
  }, [currentUser?.id]);
  useEffect(() => {
    if (!isAuthoring && restoreAuthoringFocus.current) {
      restoreAuthoringFocus.current = false;
      authoringButtonRef.current?.focus();
    }
  }, [isAuthoring]);
  useEffect(() => {
    if (isAuthoring && editingReport) authoringHeadingRef.current?.focus();
  }, [editingReport, isAuthoring]);
  if (!currentUser) return null;
  const currentUserId = currentUser.id;
  const data = mockRepository.getDashboardData(currentUser.id);
  const currentLocalReports = localReports.ownerId === currentUser.id ? localReports.reports : [];
  const readableReports = useMemo(
    () => [...currentLocalReports, ...data.dailyReports].filter((report) => can(currentUser, 'daily_report.read_body', getDailyReportBodyPermissionScope(report)).allowed),
    [currentUser, data.dailyReports, currentLocalReports],
  );

  if (currentUser.role === 'hr') {
    const hoursRows = data.workloads.filter((workload) => can(currentUser, 'worklog.read_hours', workload).allowed);
    return (
      <section className="business-page" aria-labelledby="daily-reports-page-title">
        <PageHeader title={t('daily.title')} description={t('daily.hrDescription')} />
        <DataTable
          ariaLabel={t('daily.authorizedHours')}
          rows={hoursRows}
          getRowKey={(workload) => workload.id}
          emptyMessage={t('daily.noHours')}
          columns={[
            { key: 'member', label: t('table.member'), render: (workload) => authorName(workload.userId, data.users, t('daily.unknownMember')) },
            { key: 'period', label: t('daily.period'), render: (workload) => t('hr.period', { start: workload.periodStart, end: workload.periodEnd }) },
            { key: 'hours', label: t('daily.hours'), render: (workload) => t('common.hours', { count: workload.loggedHours }) },
            { key: 'capacity', label: t('daily.capacity'), render: (workload) => t('common.hours', { count: workload.capacityHours }) },
          ]}
        />
      </section>
    );
  }

  const ownReports = readableReports.filter((report) => report.authorId === currentUser.id);
  const memberReports = readableReports.filter((report) => can(currentUser, 'daily_report.review', report).allowed);
  const linkableObjectives = data.objectives.filter((objective) => can(currentUser, 'okr.read_summary', objective).allowed);
  const linkableKeyResults = data.keyResults.filter((keyResult) => can(currentUser, 'okr.read_summary', keyResult).allowed);
  const authoringContext = resolveDailyAuthoringContext(currentUser, ownReports, linkableObjectives);
  const authoringObjectives = authoringContext
    ? linkableObjectives.filter((objective) => objective.projectId === authoringContext.report.projectId)
    : [];
  const authoringObjectiveIds = new Set(authoringObjectives.map((objective) => objective.id));
  const authoringKeyResults = linkableKeyResults.filter((keyResult) => authoringObjectiveIds.has(keyResult.objectiveId));

  async function handleSubmit(draft: DailyReportDraft) {
    if (!authoringContext) {
      return { ok: false as const, error: { key: 'daily.noAuthoringProject' } satisfies LocalizedMessage };
    }

    const conversion = toLocalDailyReport(draft, {
      authorId: authoringContext.report.authorId,
      projectId: authoringContext.report.projectId,
      fallbackObjectiveId: authoringContext.objective.id,
      date: '2026-08-11',
      submissionNonce: nextLocalSubmissionNonce.current,
      objectives: authoringObjectives,
      keyResults: authoringKeyResults,
    });
    if (!conversion.ok) {
      const errorKey = conversion.error.code === 'OBJECTIVE_NOT_IN_PROJECT'
        ? 'daily.objectiveMismatch'
        : conversion.error.code === 'KEY_RESULT_NOT_IN_OBJECTIVE'
          ? 'daily.krMismatch'
          : 'daily.fixRequired';
      return { ok: false as const, error: { key: errorKey } satisfies LocalizedMessage };
    }

    if (appMode === 'supabase') {
      const input = {
        projectId: conversion.report.projectId, objectiveId: conversion.report.objectiveId,
        reportDate: conversion.report.date, status: conversion.report.status,
        classification: conversion.report.classification, totalHours: conversion.report.hours,
        dailyObjective: conversion.report.dailyObjective ?? conversion.report.content,
        objectiveProgress: conversion.report.objectiveProgress ?? 0,
        keyResults: conversion.report.dailyKeyResults ?? [], evidenceLinks: (conversion.report.evidenceItems ?? []).filter((item) => item.kind === 'link'),
      };
      const files = draft.evidence.flatMap((item) => item.kind === 'file' && item.file ? [{ file: item.file, classification: item.classification }] : []);
      const persisted = editingReport
        ? (files.length ? await repository.updateDailyReportWithAttachments(editingReport.id, editingReport.currentRevision ?? 1, input, files) : await repository.updateDailyReport(editingReport.id, editingReport.currentRevision ?? 1, input))
        : (files.length ? await repository.createDailyReportWithAttachments(input, files) : await repository.createDailyReport(input));
      if (!persisted.ok) return { ok: false as const, error: { key: persisted.error.code === 'conflict' ? 'daily.conflict' : 'common.requestFailed' } satisfies LocalizedMessage };
    }

    nextLocalSubmissionNonce.current += 1;
    const saved = { ...conversion.report, id: editingReport?.id ?? conversion.report.id, currentRevision: (editingReport?.currentRevision ?? 0) + 1, updatedAt: new Date().toISOString() };
    setLocalReports((bucket) => ({ ownerId: currentUserId, reports: editingReport ? [saved, ...(bucket.ownerId === currentUserId ? bucket.reports : []).filter((item) => item.id !== editingReport.id)] : [saved, ...(bucket.ownerId === currentUserId ? bucket.reports : [])] }));
    setNotice('daily.saved');
    setEditingReport(undefined);
    restoreAuthoringFocus.current = true;
    setIsAuthoring(false);
    return { ok: true as const };
  }

  const reportColumns = (showReviewActions: boolean, showOwnActions: boolean) => [
    { key: 'author', label: t('daily.author'), render: (report: DailyReport) => authorName(report.authorId, data.users, t('daily.unknownMember')) },
    { key: 'date', label: t('daily.date'), render: (report: DailyReport) => report.date },
    {
      key: 'content',
      label: t('daily.content'),
      render: (report: DailyReport) => {
        const visibleEvidence = authorizedEvidence(currentUser, report);
        const evidenceClassification = visibleEvidence.reduce<Classification>((highest, item) => classificationRank[item.classification] > classificationRank[highest] ? item.classification : highest, 'public');
        return <div>
          <p>{report.dailyObjective ?? report.content}</p>
          {report.dailyKeyResults?.map((keyResult, index) => (
            <p key={keyResult.id}>
              {t('daily.krSummaryPrefix', { number: index + 1, title: keyResult.title })}
              <span>{keyResult.progress ?? '—'}%</span>
              {t('daily.krSummarySuffix')}
            </p>
          ))}
          {visibleEvidence.length > 0 && <p>{t('daily.evidenceClassification', { classification: t(classificationLabels[evidenceClassification]) })}</p>}
          <DailyReportEvidenceDetails viewer={currentUser} report={report} attachments={data.attachments} />
        </div>;
      },
    },
    { key: 'hours', label: t('daily.hours'), render: (report: DailyReport) => t('common.hours', { count: report.hours }) },
    { key: 'status', label: t('table.status'), render: (report: DailyReport) => <StatusBadge status={report.status} /> },
    ...(showOwnActions ? [{ key: 'own-actions', label: t('okr.actions'), render: (report: DailyReport) => can(currentUser, 'daily_report.edit', report).allowed ? <button type="button" className="button button--secondary" onClick={async (event) => { setNotice(null); setEditingReport(report); setIsAuthoring(true); authoringButtonRef.current = event.currentTarget; if (appMode === 'supabase') { const history = await repository.listReportRevisions(report.id); setRevisions(history.ok ? history.data as RevisionSummary[] : []); } }}>{t('daily.editMine')}</button> : <span>{t('daily.locked')}</span> }] : []),
    ...(showReviewActions ? [{ key: 'actions', label: t('daily.review'), render: () => <span className="inline-actions"><button type="button" className="button button--secondary" onClick={() => setNotice('daily.confirmedNotice')}>{t('daily.confirm')}</button><button type="button" className="text-button" onClick={() => setNotice('daily.returnedNotice')}>{t('daily.return')}</button><button type="button" className="text-button" onClick={() => setNotice('daily.commentedNotice')}>{t('daily.comment')}</button></span> }] : []),
  ];

  return (
    <section className="business-page" aria-labelledby="daily-reports-page-title">
      <PageHeader
        title={t('daily.title')}
        description={t('daily.description')}
        primaryAction={authoringContext ? { label: t('daily.fillToday'), buttonRef: authoringButtonRef, onClick: () => { setNotice(null); setIsAuthoring(true); } } : undefined}
      />
      {notice && <p className="page-notice" role="status">{t(notice)}</p>}
      {isAuthoring && authoringContext && (
        <section className="page-section" aria-labelledby="daily-report-authoring">
          <h2 id="daily-report-authoring" ref={authoringHeadingRef} tabIndex={-1}>{editingReport ? t('daily.editMine') : t('daily.fillToday')}</h2>
          <DailyReportForm
            mode={editingReport ? 'edit' : 'create'}
            initialDraft={editingReport ? dailyReportToDraft(editingReport) : undefined}
            objectives={authoringObjectives}
            keyResults={authoringKeyResults}
            onCancel={() => { restoreAuthoringFocus.current = true; setEditingReport(undefined); setIsAuthoring(false); }}
            onSubmit={handleSubmit}
          />
          {editingReport && revisions.length > 0 && <RevisionHistory revisions={revisions} />}
        </section>
      )}
      <section className="page-section" aria-labelledby="my-daily-reports"><h2 id="my-daily-reports">{t('daily.myReports')}</h2><DataTable ariaLabel={t('daily.myReports')} rows={ownReports} getRowKey={(report) => report.id} emptyMessage={t('daily.myReportsEmpty')} columns={reportColumns(false, true)} /></section>
      {currentUser.role === 'project_leader' && <section className="page-section" aria-labelledby="member-daily-reports"><h2 id="member-daily-reports">{t('daily.memberReports')}</h2><DataTable ariaLabel={t('daily.memberReports')} rows={memberReports} getRowKey={(report) => report.id} emptyMessage={t('daily.memberReportsEmpty')} columns={reportColumns(true, false)} /></section>}
    </section>
  );
}
