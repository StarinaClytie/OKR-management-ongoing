import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissionService';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { toLocalDailyReport, type DailyReportDraft } from '../domain/dailyEntry';
import { getDailyReportBodyPermissionScope } from '../domain/permissions';
import type { Classification, DailyReport, Objective, User } from '../domain/types';
import { mockRepository } from '../mocks/repository';
import { DailyReportForm } from './daily-report/DailyReportForm';
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
  const [localReports, setLocalReports] = useState<DailyReport[]>([]);
  const nextLocalSubmissionNonce = useRef(1);
  const authoringButtonRef = useRef<HTMLButtonElement>(null);
  const restoreAuthoringFocus = useRef(false);
  useEffect(() => {
    setIsAuthoring(false);
    setLocalReports([]);
    setNotice('');
    nextLocalSubmissionNonce.current = 1;
  }, [currentUser?.id]);
  useEffect(() => {
    if (!isAuthoring && restoreAuthoringFocus.current) {
      restoreAuthoringFocus.current = false;
      authoringButtonRef.current?.focus();
    }
  }, [isAuthoring]);
  if (!currentUser) return null;
  const data = mockRepository.getDashboardData(currentUser.id);
  const readableReports = useMemo(
    () => [...localReports, ...data.dailyReports].filter((report) => can(currentUser, 'daily_report.read_body', getDailyReportBodyPermissionScope(report)).allowed),
    [currentUser, data.dailyReports, localReports],
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

  function handleSubmit(draft: DailyReportDraft) {
    if (!authoringContext) {
      return { ok: false as const, error: '当前没有可授权的项目可用于填写日报。' };
    }

    const result = toLocalDailyReport(draft, {
      authorId: authoringContext.report.authorId,
      projectId: authoringContext.report.projectId,
      fallbackObjectiveId: authoringContext.objective.id,
      date: '2026-08-11',
      submissionNonce: nextLocalSubmissionNonce.current,
      objectives: authoringObjectives,
      keyResults: authoringKeyResults,
    });
    if (!result.ok) {
      return { ok: false as const, error: result.error.message };
    }

    nextLocalSubmissionNonce.current += 1;
    setLocalReports((reports) => [result.report, ...reports]);
    setNotice('日报已保存到当前演示页面，尚未连接后端。');
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
      render: (report: DailyReport) => (
        <div>
          <p>{report.dailyObjective ?? report.content}</p>
          {report.dailyKeyResults?.map((keyResult, index) => (
            <p key={keyResult.id}>KR{index + 1}：{keyResult.title}（<span>{keyResult.progress ?? '—'}%</span>）</p>
          ))}
          {report.dailyKeyResults && report.evidence.length > 0 && <p>{`成果密级：${classificationLabels[report.evidenceClassification]}`}</p>}
          <DailyReportEvidenceDetails viewer={currentUser} report={report} attachments={data.attachments} />
        </div>
      ),
    },
    { key: 'hours', label: '工时', render: (report: DailyReport) => `${report.hours} 小时` },
    { key: 'status', label: '状态', render: (report: DailyReport) => <StatusBadge status={report.status} /> },
    ...(showOwnActions ? [{ key: 'own-actions', label: '操作', render: (report: DailyReport) => can(currentUser, 'daily_report.edit', report).allowed ? <button type="button" className="button button--secondary" onClick={() => setNotice('已打开我的日报模拟编辑。')}>编辑我的日报</button> : null }] : []),
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
          <h2 id="daily-report-authoring">填写今日日报</h2>
          <DailyReportForm
            objectives={authoringObjectives}
            keyResults={authoringKeyResults}
            onCancel={() => { restoreAuthoringFocus.current = true; setIsAuthoring(false); }}
            onSubmit={handleSubmit}
          />
        </section>
      )}
      <section className="page-section" aria-labelledby="my-daily-reports"><h2 id="my-daily-reports">我的日报</h2><DataTable ariaLabel="我的日报" rows={ownReports} getRowKey={(report) => report.id} emptyMessage="今天还没有日报，填写后可在这里查看。" columns={reportColumns(false, true)} /></section>
      {currentUser.role === 'project_leader' && <section className="page-section" aria-labelledby="member-daily-reports"><h2 id="member-daily-reports">项目成员日报</h2><DataTable ariaLabel="项目成员日报" rows={memberReports} getRowKey={(report) => report.id} emptyMessage="暂无需要审核的成员日报。" columns={reportColumns(true, false)} /></section>}
    </section>
  );
}
