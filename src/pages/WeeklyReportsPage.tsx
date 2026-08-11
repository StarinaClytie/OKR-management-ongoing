import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissionService';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { mockData, mockRepository } from '../mocks/repository';

export function WeeklyReportsPage() {
  const { currentUser } = useAuth();
  const [notice, setNotice] = useState('');
  if (!currentUser) return null;
  const data = mockRepository.getDashboardData(currentUser.id);
  const reports = mockData.weeklyReports.filter((report) => {
    const project = data.projects.find((candidate) => candidate.id === report.projectId);
    return project ? can(currentUser, 'okr.read_detail', project).allowed : false;
  });
  const canCreate = currentUser.role === 'project_leader' || currentUser.role === 'management';

  return (
    <section className="business-page" aria-labelledby="weekly-reports-page-title">
      <PageHeader title="周报" description="汇总当前授权项目的进展、风险与下一步计划。" primaryAction={canCreate ? { label: '新建项目周报', onClick: () => setNotice('已打开模拟周报草稿，数据不会保存。') } : undefined} />
      {notice && <p className="page-notice" role="status">{notice}</p>}
      <DataTable
        ariaLabel="授权周报"
        rows={reports}
        getRowKey={(report) => report.id}
        emptyMessage="当前没有可查看的周报。"
        columns={[
          { key: 'week', label: '截止日期', render: (report) => report.weekEnding },
          { key: 'summary', label: '本周摘要', render: (report) => report.summary },
          { key: 'plan', label: '下周计划', render: (report) => report.nextWeekPlan },
          { key: 'status', label: '状态', render: (report) => <StatusBadge status={report.status} /> },
        ]}
      />
    </section>
  );
}
