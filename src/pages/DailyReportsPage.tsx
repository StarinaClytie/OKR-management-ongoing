import { forwardRef, useContext, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissionService';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { toLocalDailyReport, type DailyReportDraft } from '../domain/dailyEntry';
import { getDailyReportBodyPermissionScope } from '../domain/permissions';
import { currentBusinessDate } from '../domain/progressStatus';
import { canEditDailyReport } from '../domain/dailyReportPolicy';
import type { DailyReport, DailyReportDetail, User } from '../domain/types';
import { isKrOwner } from '../domain/krAssignments';
import { DailyReportForm } from './daily-report/DailyReportForm';
import { dailyReportToDraft } from '../data/dailyReportMapper';
import { repository } from '../lib/supabase';
import { RevisionHistory, type RevisionSummary } from './daily-report/RevisionHistory';
import { useLocale } from '../i18n/LocaleProvider';
import type { LocalizedMessage, MessageKey } from '../i18n/messages';
import type { DailyReportInput, DailyReportUploadSession, OkrRepository, RepositoryErrorCode } from '../data/types';
import { useDashboardData } from '../data/useDashboardData';
import { RepositoryDataState } from '../components/RepositoryDataState';
import { repositoryErrorKey } from '../i18n/repositoryErrors';
import { DailyReportDetailDialog } from './daily-report/DailyReportDetailDialog';
import { NotificationCenterContext } from '../layout/NotificationCenter';

function authorName(authorId: string, users: User[], fallback: string) {
  return users.find((user) => user.id === authorId)?.name ?? fallback;
}

function blankBlock(linkedKeyResultId = ''): DailyReportDraft['blocks'][number] {
  return {
    id: 'block-1',
    dailyObjective: '',
    linkedKeyResultId,
    workDescription: '',
    hours: 0,
    result: '',
    evidence: [],
  };
}

function dailyReportMutationErrorKey(code: RepositoryErrorCode): MessageKey {
  return code === 'conflict' ? 'daily.conflict' : repositoryErrorKey(code);
}

export interface DailyReportsPageHandle {
  openReportDetail(reportId: string): Promise<void>;
}

export const DailyReportsPage = forwardRef<DailyReportsPageHandle, { dataRepository?: OkrRepository }>(function DailyReportsPage({ dataRepository = repository }, ref) {
  const { t } = useLocale();
  const { currentUser } = useAuth();
  const notificationCenter = useContext(NotificationCenterContext);
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const [isAuthoring, setIsAuthoring] = useState(false);
  const [editingReport, setEditingReport] = useState<DailyReport>();
  const [revisions, setRevisions] = useState<RevisionSummary[]>([]);
  const [confirmedReportIds, setConfirmedReportIds] = useState<Set<string>>(() => new Set());
  const [detailDialog, setDetailDialog] = useState<{ reportId: string; loading: boolean; detail?: DailyReportDetail; error?: MessageKey }>();
  const [localReports, setLocalReports] = useState<{ ownerId: string | undefined; reports: DailyReport[] }>(() => ({ ownerId: currentUser?.id, reports: [] }));
  const nextLocalSubmissionNonce = useRef(1);
  const authoringButtonRef = useRef<HTMLButtonElement>(null);
  const authoringHeadingRef = useRef<HTMLHeadingElement>(null);
  const restoreAuthoringFocus = useRef(false);
  const detailTriggerRef = useRef<HTMLButtonElement>(null);
  const restoreDetailFocus = useRef(false);
  const detailRequestId = useRef(0);
  const dashboard = useDashboardData(dataRepository, currentUser?.id);
  const [searchParams] = useSearchParams();
  useImperativeHandle(ref, () => ({ openReportDetail: (reportId: string) => openReportDetail(reportId) }));
  useEffect(() => {
    setIsAuthoring(false);
    setEditingReport(undefined);
    setRevisions([]);
    setConfirmedReportIds(new Set());
    setLocalReports({ ownerId: currentUser?.id, reports: [] });
    setNotice(null);
    setDetailDialog(undefined);
    detailRequestId.current += 1;
    nextLocalSubmissionNonce.current = 1;
  }, [currentUser?.id]);
  useEffect(() => {
    if (!isAuthoring && restoreAuthoringFocus.current) {
      restoreAuthoringFocus.current = false;
      authoringButtonRef.current?.focus();
    }
  }, [isAuthoring]);
  useEffect(() => {
    if (!detailDialog && restoreDetailFocus.current) {
      restoreDetailFocus.current = false;
      detailTriggerRef.current?.focus();
    }
  }, [detailDialog]);
  useEffect(() => {
    if (isAuthoring && editingReport) authoringHeadingRef.current?.focus();
  }, [editingReport, isAuthoring]);
  if (!currentUser) return null;
  if (dashboard.status !== 'ready') {
    return <section className="business-page" aria-labelledby="daily-reports-page-title"><PageHeader title={t('daily.title')} description={t('daily.description')} /><RepositoryDataState state={dashboard} /></section>;
  }
  const currentUserId = currentUser.id;
  const businessDate = currentBusinessDate();
  const data = dashboard.data;
  const currentLocalReports = localReports.ownerId === currentUser.id ? localReports.reports : [];
  const localReportIds = new Set(currentLocalReports.map((report) => report.id));
  const readableReports = [
    ...currentLocalReports,
    ...data.dailyReports.filter((report) => !localReportIds.has(report.id)),
  ].map((report) => confirmedReportIds.has(report.id) ? { ...report, status: 'confirmed' as const } : report)
    .filter((report) => can(currentUser, 'daily_report.read_body', getDailyReportBodyPermissionScope(report)).allowed);

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
          ]}
        />
      </section>
    );
  }

  const ownReports = readableReports.filter((report) => report.authorId === currentUser.id);
  const memberReports = readableReports.filter((report) => can(currentUser, 'daily_report.review', report).allowed);
  const ownedKeyResults = data.keyResults.filter((keyResult) => isKrOwner(currentUser.id, keyResult.id, data.krAssignments) && can(currentUser, 'okr.read_summary', keyResult).allowed);
  const linkableObjectives = data.objectives.filter((objective) => can(currentUser, 'okr.read_summary', objective).allowed);
  const requestedKrId = searchParams.get('krId');
  const requestedKr = requestedKrId ? ownedKeyResults.find((keyResult) => keyResult.id === requestedKrId) : undefined;
  const canAuthor = ownedKeyResults.length > 0;

  const prefillDraft: DailyReportDraft | undefined = requestedKr
    ? { blocks: [blankBlock(requestedKr.id)], classification: 'public' }
    : undefined;

  const uploadRepository = dataRepository.mode === 'supabase'
    && dataRepository.beginDailyReportUploadSession
    && dataRepository.uploadDailyReportAttachment
    && dataRepository.abandonDailyReportUploadSession
    && dataRepository.submitDailyReportSession
    ? {
        beginDailyReportUploadSession: (input: Parameters<NonNullable<OkrRepository['beginDailyReportUploadSession']>>[0]) => dataRepository.beginDailyReportUploadSession!(input),
        uploadDailyReportAttachment: (input: Parameters<NonNullable<OkrRepository['uploadDailyReportAttachment']>>[0]) => dataRepository.uploadDailyReportAttachment!(input),
        abandonDailyReportUploadSession: (sessionId: string) => dataRepository.abandonDailyReportUploadSession!(sessionId),
        submitDailyReportSession: (input: DailyReportInput, sessionId: string) => dataRepository.submitDailyReportSession!(input, sessionId),
        findDailyReportUploadSession: dataRepository.findDailyReportUploadSession
          ? (reportDate: string) => dataRepository.findDailyReportUploadSession!(reportDate)
          : undefined,
      }
    : undefined;

  async function handleSubmit(draft: DailyReportDraft, uploadSession?: DailyReportUploadSession) {
    const reportDate = editingReport?.date ?? businessDate;
    const conversion = toLocalDailyReport(draft, {
      authorId: currentUserId,
      date: reportDate,
      submissionNonce: nextLocalSubmissionNonce.current,
      keyResults: data.keyResults,
      objectives: data.objectives,
    }, { allowLegacyLinkEvidence: Boolean(editingReport) });
    if (!conversion.ok) {
      return { ok: false as const, error: { key: conversion.error.code === 'KEY_RESULT_NOT_AVAILABLE' ? 'daily.krMismatch' : 'daily.fixRequired' } satisfies LocalizedMessage };
    }

    const existingReport = editingReport ?? currentLocalReports.find((report) => report.date === conversion.report.date);
    let savedId = existingReport?.id ?? conversion.report.id;
    let savedRevision = (existingReport?.currentRevision ?? 0) + 1;

    if (dataRepository.mode === 'supabase') {
      const input: DailyReportInput = {
        reportDate: conversion.report.date,
        status: conversion.report.status,
        classification: conversion.report.classification,
        blocks: draft.blocks.map((block) => ({
          dailyObjective: block.dailyObjective,
          linkedKeyResultId: block.linkedKeyResultId,
          workDescription: block.workDescription,
          hours: block.hours,
          result: block.result,
          evidenceLinks: block.evidence.filter((item) => item.kind === 'link'),
          attachments: block.evidence.flatMap((item) => item.kind === 'file' && item.attachmentId ? [{
            attachmentId: item.attachmentId,
            displayName: item.label,
            classification: item.classification,
          }] : []),
        })),
        evidenceLinks: (conversion.report.evidenceItems ?? []).filter((item) => item.kind === 'link'),
      };
      if (!uploadSession || !dataRepository.submitDailyReportSession) {
        return { ok: false as const, error: { key: 'common.requestFailed' } satisfies LocalizedMessage };
      }
      const persistedAttachmentIds = new Set([
        ...(editingReport?.attachmentIds ?? []),
        ...(editingReport?.blocks ?? []).flatMap((block) => (block.evidenceItems ?? []).flatMap((item) => (
          item.kind === 'file' && item.attachmentId ? [item.attachmentId] : []
        ))),
      ]);
      const retainedAttachmentIds = draft.blocks.flatMap((block) => block.evidence.flatMap((item) => item.kind === 'file' && item.attachmentId && persistedAttachmentIds.has(item.attachmentId) ? [item.attachmentId] : []));
      if (retainedAttachmentIds.length > 0) {
        if (!dataRepository.adoptDailyReportAttachments) {
          return { ok: false as const, error: { key: 'common.requestFailed' } satisfies LocalizedMessage };
        }
        const adopted = await dataRepository.adoptDailyReportAttachments(uploadSession, retainedAttachmentIds);
        if (!adopted.ok) return { ok: false as const, error: { key: dailyReportMutationErrorKey(adopted.error.code) } satisfies LocalizedMessage };
      }
      const persisted = await dataRepository.submitDailyReportSession(input, uploadSession.sessionId);
      if (!persisted.ok) return { ok: false as const, error: { key: dailyReportMutationErrorKey(persisted.error.code) } satisfies LocalizedMessage };
      if (editingReport && persisted.data.id !== editingReport.id) return { ok: false as const, error: { key: 'daily.conflict' } satisfies LocalizedMessage };
      savedId = persisted.data.id;
      savedRevision = persisted.data.revision;
    }

    nextLocalSubmissionNonce.current += 1;
    const saved = { ...conversion.report, id: savedId, currentRevision: savedRevision, updatedAt: new Date().toISOString() };
    setLocalReports((bucket) => ({ ownerId: currentUserId, reports: [saved, ...(bucket.ownerId === currentUserId ? bucket.reports : []).filter((item) => item.id !== savedId)] }));
    setNotice('daily.saved');
    setEditingReport(undefined);
    restoreAuthoringFocus.current = true;
    setIsAuthoring(false);
    return { ok: true as const };
  }

  async function downloadPersistedAttachment(attachmentId: string) {
    const result = await dataRepository.createAttachmentDownload(attachmentId);
    if (!result.ok) {
      setNotice('common.requestFailed');
      return;
    }
    const anchor = document.createElement('a');
    anchor.href = result.data.url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  }

  async function removePersistedAttachment(attachmentId: string, options?: { preserveRevisionHistory?: boolean }) {
    // Persisted evidence is authorized for omission from the next revision;
    // new session evidence is destructively removed from metadata and Storage.
    const result = await dataRepository.removeAttachment(attachmentId, {
      preserveRevisionHistory: options?.preserveRevisionHistory ?? true,
    });
    if (!result.ok) setNotice('common.requestFailed');
    return result.ok;
  }

  async function openDailyReportEditor(report: DailyReport, button: HTMLButtonElement) {
    const editable = can(currentUser, 'daily_report.edit', report).allowed
      && canEditDailyReport(currentUserId, report, currentBusinessDate());
    if (!editable) {
      setNotice('daily.reportLocked');
      return;
    }
    setNotice(null);
    setEditingReport(report);
    setIsAuthoring(true);
    authoringButtonRef.current = button;
    if (dataRepository.mode === 'supabase') {
      const history = await dataRepository.listReportRevisions(report.id);
      setRevisions(history.ok ? history.data as RevisionSummary[] : []);
    }
  }

  async function openTodayReport() {
    const todayReport = ownReports.find((report) => report.date === businessDate);
    if (!todayReport) {
      setNotice(null);
      setEditingReport(undefined);
      setIsAuthoring(true);
      return;
    }
    if (!can(currentUser, 'daily_report.edit', todayReport).allowed
      || !canEditDailyReport(currentUserId, todayReport, businessDate)) {
      setNotice('daily.reportLocked');
      setEditingReport(undefined);
      setIsAuthoring(false);
      return;
    }
    await openDailyReportEditor(todayReport, authoringButtonRef.current!);
  }

  async function openReportDetail(reportId: string, trigger?: HTMLButtonElement) {
    const requestId = detailRequestId.current + 1;
    detailRequestId.current = requestId;
    detailTriggerRef.current = trigger ?? null;
    restoreDetailFocus.current = false;
    setNotice(null);
    setDetailDialog({ reportId, loading: true });
    const result = await dataRepository.getDailyReportDetail(reportId);
    if (detailRequestId.current !== requestId) return;
    if (!result.ok) {
      setDetailDialog({ reportId, loading: false, error: repositoryErrorKey(result.error.code) });
      return;
    }
    setDetailDialog({ reportId, loading: false, detail: result.data });
  }

  function closeReportDetail() {
    detailRequestId.current += 1;
    restoreDetailFocus.current = detailTriggerRef.current !== null;
    setDetailDialog(undefined);
  }

  function handleReportConfirmed(reportId: string) {
    setConfirmedReportIds((current) => new Set(current).add(reportId));
    setNotice('daily.confirmedNotice');
  }

  const reportColumns = (showOwnActions: boolean) => [
    { key: 'author', label: t('daily.author'), render: (report: DailyReport) => authorName(report.authorId, data.users, t('daily.unknownMember')) },
    { key: 'date', label: t('daily.date'), render: (report: DailyReport) => report.date },
    { key: 'content', label: t('daily.content'), render: (report: DailyReport) => t('daily.entryCount', { count: Math.max(report.blocks?.length ?? 0, 1) }) },
    { key: 'hours', label: t('daily.hours'), render: (report: DailyReport) => t('common.hours', { count: report.hours }) },
    { key: 'status', label: t('table.status'), render: (report: DailyReport) => <StatusBadge status={report.status} /> },
    { key: 'actions', label: t('okr.actions'), render: (report: DailyReport) => (
      <div className="data-table__actions">
        <button type="button" className="button button--secondary" onClick={(event) => void openReportDetail(report.id, event.currentTarget)}>{t('daily.viewDetails')}</button>
        {showOwnActions ? can(currentUser, 'daily_report.edit', report).allowed && canEditDailyReport(currentUserId, report, businessDate)
          ? <button type="button" className="button button--secondary" onClick={(event) => void openDailyReportEditor(report, event.currentTarget)}>{t('daily.editMine')}</button>
          : <span>{t('daily.locked')}</span> : null}
      </div>
    ) },
  ];

  return (
    <section className="business-page" aria-labelledby="daily-reports-page-title">
      <PageHeader
        title={t('daily.title')}
        description={t('daily.description')}
        primaryAction={canAuthor ? { label: t('daily.fillToday'), buttonRef: authoringButtonRef, onClick: () => { void openTodayReport(); } } : undefined}
      />
      {notice && <p className="page-notice" role="status">{t(notice)}</p>}
      {!canAuthor && <p className="data-table__empty">{t('daily.noOwnedKr')}</p>}
      {isAuthoring && canAuthor && (
        <section className="page-section" aria-labelledby="daily-report-authoring">
          <h2 id="daily-report-authoring" ref={authoringHeadingRef} tabIndex={-1}>{editingReport ? t('daily.editMine') : t('daily.fillToday')}</h2>
          <DailyReportForm
            mode={editingReport ? 'edit' : 'create'}
            initialDraft={editingReport ? dailyReportToDraft(editingReport) : prefillDraft}
            ownedKeyResults={ownedKeyResults}
            objectives={linkableObjectives}
            onCancel={() => { restoreAuthoringFocus.current = true; setEditingReport(undefined); setIsAuthoring(false); }}
            onSubmit={handleSubmit}
            onDownloadAttachment={downloadPersistedAttachment}
            onRemoveAttachment={removePersistedAttachment}
            clearance={currentUser.clearance}
            reportDate={editingReport?.date ?? businessDate}
            uploadRepository={uploadRepository}
          />
          {editingReport && revisions.length > 0 && <RevisionHistory revisions={revisions} />}
        </section>
      )}
      <section className="page-section" aria-labelledby="my-daily-reports"><h2 id="my-daily-reports">{t('daily.myReports')}</h2><DataTable ariaLabel={t('daily.myReports')} rows={ownReports} getRowKey={(report) => report.id} emptyMessage={t('daily.myReportsEmpty')} columns={reportColumns(true)} /></section>
      {(currentUser.role === 'project_leader' || currentUser.role === 'management') && <section className="page-section" aria-labelledby="member-daily-reports"><h2 id="member-daily-reports">{t('daily.memberReports')}</h2><DataTable ariaLabel={t('daily.memberReports')} rows={memberReports} getRowKey={(report) => report.id} emptyMessage={t('daily.memberReportsEmpty')} columns={reportColumns(false)} /></section>}
      {detailDialog ? (
        <DailyReportDetailDialog
          detail={detailDialog.detail}
          loading={detailDialog.loading}
          error={detailDialog.error}
          repository={dataRepository}
          onClose={closeReportDetail}
          onConfirmed={handleReportConfirmed}
          onNotificationMutation={notificationCenter?.notifications.refresh}
        />
      ) : null}
    </section>
  );
});
