import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissionService';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import type { DailyReport } from '../domain/types';
import { mockRepository } from '../mocks/repository';

function authorName(authorId: string, users: ReturnType<typeof mockRepository.getDashboardData>['users']) {
  return users.find((user) => user.id === authorId)?.name ?? '未知成员';
}

export function DailyReportsPage() {
  const { currentUser } = useAuth();
  const [notice, setNotice] = useState('');
  if (!currentUser) return null;
  const data = mockRepository.getDashboardData(currentUser.id);
  const readableReports = useMemo(
    () => data.dailyReports.filter((report) => can(currentUser, 'daily_report.read_body', report).allowed),
    [currentUser, data.dailyReports],
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
  const authoringReport = ownReports[0];

  const reportColumns = (showReviewActions: boolean) => [
    { key: 'author', label: '填写人', render: (report: DailyReport) => authorName(report.authorId, data.users) },
    { key: 'date', label: '日期', render: (report: DailyReport) => report.date },
    { key: 'content', label: '日报内容', render: (report: DailyReport) => report.content },
    { key: 'hours', label: '工时', render: (report: DailyReport) => `${report.hours} 小时` },
    { key: 'status', label: '状态', render: (report: DailyReport) => <StatusBadge status={report.status} /> },
    ...(showReviewActions ? [{ key: 'actions', label: '审核', render: () => <span className="inline-actions"><button type="button" className="button button--secondary" onClick={() => setNotice('已确认成员日报（模拟操作）。')}>确认成员日报</button><button type="button" className="text-button" onClick={() => setNotice('已退回成员日报（模拟操作）。')}>退回成员日报</button></span> }] : []),
  ];

  return (
    <section className="business-page" aria-labelledby="daily-reports-page-title">
      <PageHeader
        title="日报"
        description="我的日报由本人创建和编辑；项目负责人仅能审核成员日报，不能修改成员原文。"
        primaryAction={authoringReport && can(currentUser, 'daily_report.create', authoringReport).allowed ? { label: '填写今日日报', onClick: () => setNotice('已开始一份仅保存在当前页面的模拟日报。') } : undefined}
      />
      {notice && <p className="page-notice" role="status">{notice}</p>}
      <section className="page-section" aria-labelledby="my-daily-reports"><h2 id="my-daily-reports">我的日报</h2><DataTable ariaLabel="我的日报" rows={ownReports} getRowKey={(report) => report.id} emptyMessage="今天还没有日报，填写后可在这里查看。" columns={reportColumns(false)} /></section>
      {currentUser.role === 'project_leader' && <section className="page-section" aria-labelledby="member-daily-reports"><h2 id="member-daily-reports">项目成员日报</h2><DataTable ariaLabel="项目成员日报" rows={memberReports} getRowKey={(report) => report.id} emptyMessage="暂无需要审核的成员日报。" columns={reportColumns(true)} /></section>}
    </section>
  );
}
