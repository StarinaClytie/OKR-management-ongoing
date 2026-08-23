import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissionService';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { toLocalDailyReport, type DailyReportDraft } from '../domain/dailyEntry';
import { getDailyReportBodyPermissionScope } from '../domain/permissions';
import { currentBusinessDate } from '../domain/progressStatus';
import type { DailyReport, KeyResult, User } from '../domain/types';
import { isKrOwner } from '../domain/krAssignments';
import { DailyReportForm } from './daily-report/DailyReportForm';
import { dailyReportToDraft } from '../data/dailyReportMapper';
import { repository } from '../lib/supabase';
import { RevisionHistory, type RevisionSummary } from './daily-report/RevisionHistory';
import { useLocale } from '../i18n/LocaleProvider';
import type { LocalizedMessage, MessageKey } from '../i18n/messages';
import type { DailyReportInput, OkrRepository } from '../data/types';
import { useDashboardData } from '../data/useDashboardData';
import { RepositoryDataState } from '../components/RepositoryDataState';

function authorName(authorId: string, users: User[], fallback: string) {
  return users.find((user) => user.id === authorId)?.name ?? fallback;
}

function keyResultTitle(keyResultId: string, keyResults: readonly KeyResult[], fallback: string) {
  return keyResults.find((keyResult) => keyResult.id === keyResultId)?.title ?? fallback;
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

export function DailyReportsPage({ dataRepository = repository }: { dataRepository?: OkrRepository }) {
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
  const dashboard = useDashboardData(dataRepository, currentUser?.id);
  const [searchParams] = useSearchParams();
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
  if (dashboard.status !== 'ready') {
    return <section className="business-page" aria-labelledby="daily-reports-page-title"><PageHeader title={t('daily.title')} description={t('daily.description')} /><RepositoryDataState state={dashboard} /></section>;
  }
  const currentUserId = currentUser.id;
  const data = dashboard.data;
  const currentLocalReports = localReports.ownerId === currentUser.id ? localReports.reports : [];
  const readableReports = [...currentLocalReports, ...data.dailyReports].filter((report) => can(currentUser, 'daily_report.read_body', getDailyReportBodyPermissionScope(report)).allowed);

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
    ? { blocks: [blankBlock(requestedKr.id)], classification: 'internal' }
    : undefined;

  async function handleSubmit(draft: DailyReportDraft) {
    const conversion = toLocalDailyReport(draft, {
      authorId: currentUserId,
      date: currentBusinessDate(),
      submissionNonce: nextLocalSubmissionNonce.current,
      keyResults: data.keyResults,
      objectives: data.objectives,
    }, { allowLegacyLinkEvidence: Boolean(editingReport) });
    if (!conversion.ok) {
      return { ok: false as const, error: { key: conversion.error.code === 'KEY_RESULT_NOT_AVAILABLE' ? 'daily.krMismatch' : 'daily.fixRequired' } satisfies LocalizedMessage };
    }

    const existingToday = editingReport ?? currentLocalReports.find((report) => report.date === conversion.report.date);
    let savedId = existingToday?.id ?? conversion.report.id;
    let savedRevision = (existingToday?.currentRevision ?? 0) + 1;

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
      const files = draft.blocks.flatMap((block, index) => block.evidence.flatMap((item) => item.kind === 'file' && item.file ? [{ file: item.file, classification: item.classification, entryPosition: index + 1, label: item.label }] : []));
      const persisted = await dataRepository.saveDailyReport(input, files);
      if (!persisted.ok) return { ok: false as const, error: { key: persisted.error.code === 'conflict' ? 'daily.conflict' : 'common.requestFailed' } satisfies LocalizedMessage };
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

  async function removePersistedAttachment(attachmentId: string) {
    const result = await dataRepository.removeAttachment(attachmentId);
    if (!result.ok) setNotice('common.requestFailed');
    return result.ok;
  }

  const reportContent = (report: DailyReport) => {
    const blocks = report.blocks ?? [];
    if (blocks.length > 0) {
      return (
        <div className="daily-blocks">
          {blocks.map((block) => (
            <div key={block.id} className="daily-block">
              <p><strong>{t('daily.objective')}：</strong>{block.dailyObjective}</p>
              <p><strong>{t('daily.linkedQuarterlyKr')}：</strong>{keyResultTitle(block.keyResultId, data.keyResults, t('daily.unknownMember'))}</p>
              {block.workDescription ? <p><strong>{t('daily.workDescription')}：</strong>{block.workDescription}</p> : block.keyResults.map((keyResult) => (
                <p key={keyResult.id}>{keyResult.title}</p>
              ))}
              {block.result ? <p><strong>{t('daily.result')}：</strong>{block.result}</p> : null}
            </div>
          ))}
        </div>
      );
    }
    return <p>{report.dailyObjective ?? report.content}</p>;
  };

  const reportColumns = (showOwnActions: boolean) => [
    { key: 'author', label: t('daily.author'), render: (report: DailyReport) => authorName(report.authorId, data.users, t('daily.unknownMember')) },
    { key: 'date', label: t('daily.date'), render: (report: DailyReport) => report.date },
    { key: 'content', label: t('daily.content'), render: (report: DailyReport) => reportContent(report) },
    { key: 'hours', label: t('daily.hours'), render: (report: DailyReport) => t('common.hours', { count: report.hours }) },
    { key: 'status', label: t('table.status'), render: (report: DailyReport) => <StatusBadge status={report.status} /> },
    ...(showOwnActions ? [{ key: 'own-actions', label: t('okr.actions'), render: (report: DailyReport) => can(currentUser, 'daily_report.edit', report).allowed ? <button type="button" className="button button--secondary" onClick={async (event) => { setNotice(null); setEditingReport(report); setIsAuthoring(true); authoringButtonRef.current = event.currentTarget; if (dataRepository.mode === 'supabase') { const history = await dataRepository.listReportRevisions(report.id); setRevisions(history.ok ? history.data as RevisionSummary[] : []); } }}>{t('daily.editMine')}</button> : <span>{t('daily.locked')}</span> }] : []),
  ];

  return (
    <section className="business-page" aria-labelledby="daily-reports-page-title">
      <PageHeader
        title={t('daily.title')}
        description={t('daily.description')}
        primaryAction={canAuthor ? { label: t('daily.fillToday'), buttonRef: authoringButtonRef, onClick: () => { setNotice(null); setIsAuthoring(true); } } : undefined}
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
          />
          {editingReport && revisions.length > 0 && <RevisionHistory revisions={revisions} />}
        </section>
      )}
      <section className="page-section" aria-labelledby="my-daily-reports"><h2 id="my-daily-reports">{t('daily.myReports')}</h2><DataTable ariaLabel={t('daily.myReports')} rows={ownReports} getRowKey={(report) => report.id} emptyMessage={t('daily.myReportsEmpty')} columns={reportColumns(true)} /></section>
      {currentUser.role === 'project_leader' && <section className="page-section" aria-labelledby="member-daily-reports"><h2 id="member-daily-reports">{t('daily.memberReports')}</h2><DataTable ariaLabel={t('daily.memberReports')} rows={memberReports} getRowKey={(report) => report.id} emptyMessage={t('daily.memberReportsEmpty')} columns={reportColumns(false)} /></section>}
    </section>
  );
}
