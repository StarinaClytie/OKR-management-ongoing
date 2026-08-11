import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissionService';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { ProgressRing } from '../components/ProgressRing';
import { StatusBadge } from '../components/StatusBadge';
import { mockRepository } from '../mocks/repository';

export function OkrManagementPage() {
  const { currentUser } = useAuth();
  const [notice, setNotice] = useState('');
  if (!currentUser) return null;
  const data = mockRepository.getDashboardData(currentUser.id);
  const keyResults = data.keyResults.filter((keyResult) => can(currentUser, 'okr.read_detail', keyResult).allowed);
  const ownKeyResult = keyResults.find((keyResult) => keyResult.ownerId === currentUser.id);

  return (
    <section className="business-page" aria-labelledby="okr-page-title">
      <PageHeader
        title="OKR 管理"
        description="查看当前授权范围内的目标与关键结果；进度更新仅开放给实际负责人。"
        primaryAction={ownKeyResult ? { label: '更新我的 KR', onClick: () => setNotice('已打开模拟进度更新，数据不会保存。') } : undefined}
      />
      {notice && <p className="page-notice" role="status">{notice}</p>}
      <div className="filter-row"><span>当前范围</span><strong>{currentUser.department}</strong><button className="button button--secondary" type="button">更多筛选</button></div>
      <DataTable
        ariaLabel="授权关键结果"
        rows={keyResults}
        getRowKey={(keyResult) => keyResult.id}
        emptyMessage="当前没有可查看的关键结果。"
        columns={[
          { key: 'title', label: '关键结果', render: (keyResult) => keyResult.title },
          { key: 'progress', label: '进度', render: (keyResult) => <ProgressRing value={keyResult.progress} size="small" /> },
          { key: 'status', label: '状态', render: (keyResult) => <StatusBadge status={keyResult.status} /> },
          { key: 'owner', label: '负责人', render: (keyResult) => data.users.find((user) => user.id === keyResult.ownerId)?.name ?? '—' },
        ]}
      />
    </section>
  );
}
