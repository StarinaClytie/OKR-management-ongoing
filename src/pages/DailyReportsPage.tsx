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

function authorName(authorId: string, users: ReturnType<typeof mockRepository.getDashboardData>['users']) {
  return users.find((user) => user.id === authorId)?.name ?? '未知成员';
}

const classificationLabels: Record<Classification, string> = {
  public: '公开',
  internal: '内部',
  confidential: '机密',
  restricted: '受限',
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
  const { currentUser } = useAuth();
  const [notice, setNotice] = useState('');
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
    setNotice('');
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
        <PageHeader title="日报" description="HR 视图只展示已授权的工时字段，不包含日报原文、证据或附件。" />
        <DataTable
          ariaLabel="授权工时日报"
          rows={hoursRows}
          getRowKey={(workload) => workload.id}
          emptyMessage="当前没有可查看的授权工时。"
          columns={[
            { key: 'member', label: '成员', render: (workload) => authorName(workload.userId, data.users) },
            { key: 'period', label: '周期', render: (workload) => `${workload.periodStart} 至 ${workload.periodEnd}` },
            { key: 'hours', label: '工时', render: (workload) => `${workload.loggedHours} 小时` },
            { key: 'capacity', label: '容量', render: (workload) => `${workload.capacityHours} 小时` },
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
      return { ok: false as const, error: '当前没有可授权的项目可用于填写日报。' };
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
      return { ok: false as const, error: conversion.error.message };
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
      if (!persisted.ok) return { ok: false as const, error: persisted.error.code === 'conflict' ? '日报已被更新，请刷新后重试。' : persisted.error.message };
    }

    nextLocalSubmissionNonce.current += 1;
    const saved = { ...conversion.report, id: editingReport?.id ?? conversion.report.id, currentRevision: (editingReport?.currentRevision ?? 0) + 1, updatedAt: new Date().toISOString() };
    setLocalReports((bucket) => ({ ownerId: currentUserId, reports: editingReport ? [saved, ...(bucket.ownerId === currentUserId ? bucket.reports : []).filter((item) => item.id !== editingReport.id)] : [saved, ...(bucket.ownerId === currentUserId ? bucket.reports : [])] }));
    setNotice(appMode === 'demo' ? '日报已保存到当前演示页面，尚未连接后端。' : '日报已安全保存。');
    setEditingReport(undefined);
    restoreAuthoringFocus.current = true;
    setIsAuthoring(false);
    return { ok: true as const };
  }

  const reportColumns = (showReviewActions: boolean, showOwnActions: boolean) => [
    { key: 'author', label: '填写人', render: (report: DailyReport) => authorName(report.authorId, data.users) },
    { key: 'date', label: '日期', render: (report: DailyReport) => report.date },
    {
      key: 'content',
      label: '日报内容',
      render: (report: DailyReport) => {
        const visibleEvidence = authorizedEvidence(currentUser, report);
        const evidenceClassification = visibleEvidence.reduce<Classification>((highest, item) => classificationRank[item.classification] > classificationRank[highest] ? item.classification : highest, 'public');
        return <div>
          <p>{report.dailyObjective ?? report.content}</p>
          {report.dailyKeyResults?.map((keyResult, index) => (
            <p key={keyResult.id}>KR{index + 1}：{keyResult.title}（<span>{keyResult.progress ?? '—'}%</span>）</p>
          ))}
          {visibleEvidence.length > 0 && <p>{`成果密级：${classificationLabels[evidenceClassification]}`}</p>}
          <DailyReportEvidenceDetails viewer={currentUser} report={report} attachments={data.attachments} />
        </div>;
      },
    },
    { key: 'hours', label: '工时', render: (report: DailyReport) => `${report.hours} 小时` },
    { key: 'status', label: '状态', render: (report: DailyReport) => <StatusBadge status={report.status} /> },
    ...(showOwnActions ? [{ key: 'own-actions', label: '操作', render: (report: DailyReport) => can(currentUser, 'daily_report.edit', report).allowed ? <button type="button" className="button button--secondary" onClick={async (event) => { setNotice(''); setEditingReport(report); setIsAuthoring(true); authoringButtonRef.current = event.currentTarget; if (appMode === 'supabase') { const history = await repository.listReportRevisions(report.id); setRevisions(history.ok ? history.data as RevisionSummary[] : []); } }}>编辑我的日报</button> : <span>已锁定</span> }] : []),
    ...(showReviewActions ? [{ key: 'actions', label: '审核', render: () => <span className="inline-actions"><button type="button" className="button button--secondary" onClick={() => setNotice('已确认成员日报（模拟操作）。')}>确认成员日报</button><button type="button" className="text-button" onClick={() => setNotice('已退回成员日报（模拟操作）。')}>退回成员日报</button><button type="button" className="text-button" onClick={() => setNotice('已添加成员日报评论（模拟操作）。')}>添加评论</button></span> }] : []),
  ];

  return (
    <section className="business-page" aria-labelledby="daily-reports-page-title">
      <PageHeader
        title="日报"
        description="我的日报由本人创建和编辑；项目负责人仅能审核成员日报，不能修改成员原文。"
        primaryAction={authoringContext ? { label: '填写今日日报', buttonRef: authoringButtonRef, onClick: () => { setNotice(''); setIsAuthoring(true); } } : undefined}
      />
      {notice && <p className="page-notice" role="status">{notice}</p>}
      {isAuthoring && authoringContext && (
        <section className="page-section" aria-labelledby="daily-report-authoring">
          <h2 id="daily-report-authoring" ref={authoringHeadingRef} tabIndex={-1}>{editingReport ? '编辑我的日报' : '填写今日日报'}</h2>
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
      <section className="page-section" aria-labelledby="my-daily-reports"><h2 id="my-daily-reports">我的日报</h2><DataTable ariaLabel="我的日报" rows={ownReports} getRowKey={(report) => report.id} emptyMessage="今天还没有日报，填写后可在这里查看。" columns={reportColumns(false, true)} /></section>
      {currentUser.role === 'project_leader' && <section className="page-section" aria-labelledby="member-daily-reports"><h2 id="member-daily-reports">项目成员日报</h2><DataTable ariaLabel="项目成员日报" rows={memberReports} getRowKey={(report) => report.id} emptyMessage="暂无需要审核的成员日报。" columns={reportColumns(true, false)} /></section>}
    </section>
  );
}
