import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';

export function SettingsPage() {
  const { currentUser } = useAuth();
  const [notice, setNotice] = useState('');
  if (!currentUser) return null;
  const tabs = [
    { id: 'personal', label: '个人偏好', description: '通知节奏、默认项目和页面显示方式。' },
    ...(currentUser.role === 'project_leader' ? [{ id: 'project', label: '项目偏好', description: '项目检查节点和日报审核提醒。' }] : []),
    ...(currentUser.role === 'hr' ? [{ id: 'hr', label: 'HR 规则', description: '授权工时字段和组织汇总偏好。' }] : []),
    ...(currentUser.role === 'administrator' ? [{ id: 'system', label: '系统设置', description: '用户、角色、权限与审计元数据。' }] : []),
  ];
  const [activeTab, setActiveTab] = useState(tabs[0].id);
  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  return (
    <section className="business-page" aria-labelledby="settings-page-title">
      <PageHeader title="设置" description="按角色提供个人、项目、HR 或系统配置入口；此版本不会持久化修改。" primaryAction={{ label: '保存模拟设置', onClick: () => setNotice('设置已在本地演示状态中保存。') }} />
      {notice && <p className="page-notice" role="status">{notice}</p>}
      <div className="settings-tabs" role="tablist" aria-label="设置类别">
        {tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={tab.id === activeTab} className="settings-tab" onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
      </div>
      <section className="settings-panel" role="tabpanel" aria-label={active.label}><h2>{active.label}</h2><p>{active.description}</p><label className="settings-toggle"><input type="checkbox" defaultChecked /> 接收相关提醒</label></section>
    </section>
  );
}
