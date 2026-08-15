import { useId, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';

export function SettingsPage() {
  const { currentUser } = useAuth();
  const [state, setState] = useState(() => ({ ownerId: currentUser?.id, notice: '', activeTab: 'personal', reminders: true }));
  if (!currentUser) return null;
  const tabs = [
    { id: 'personal', label: '个人偏好', description: '通知节奏、默认项目和页面显示方式。' },
    ...(currentUser.role === 'project_leader' ? [{ id: 'project', label: '项目偏好', description: '项目检查节点和日报审核提醒。' }] : []),
    ...(currentUser.role === 'hr' ? [{ id: 'hr', label: 'HR 规则', description: '授权工时字段和组织汇总偏好。' }] : []),
    ...(currentUser.role === 'administrator' ? [{ id: 'system', label: '系统设置', description: '用户、角色、权限与审计元数据。' }] : []),
  ];
  const ownedState = state.ownerId === currentUser.id ? state : { ownerId: currentUser.id, notice: '', activeTab: 'personal', reminders: true };
  const activeTab = tabs.some((tab) => tab.id === ownedState.activeTab) ? ownedState.activeTab : tabs[0].id;
  const idBase = useId();
  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  return (
    <section className="business-page" aria-labelledby="settings-page-title">
      <PageHeader title="设置" description="按角色提供个人、项目、HR 或系统配置入口；此版本不会持久化修改。" primaryAction={{ label: '保存模拟设置', onClick: () => setState({ ...ownedState, notice: '设置已在本地演示状态中保存。' }) }} />
      {ownedState.notice && <p className="page-notice" role="status">{ownedState.notice}</p>}
      <div className="settings-tabs" role="tablist" aria-label="设置类别">
        {tabs.map((tab) => <button key={tab.id} id={`${idBase}-${tab.id}-tab`} type="button" role="tab" aria-selected={tab.id === activeTab} aria-controls={tab.id === activeTab ? `${idBase}-${tab.id}-panel` : undefined} className="settings-tab" onClick={() => setState({ ...ownedState, activeTab: tab.id, notice: '' })}>{tab.label}</button>)}
      </div>
      <section id={`${idBase}-${active.id}-panel`} className="settings-panel form-card form-section" role="tabpanel" aria-label={active.label} aria-labelledby={`${idBase}-${active.id}-tab`}><h2>{active.label}</h2><p>{active.description}</p><label className="settings-toggle"><input type="checkbox" checked={ownedState.reminders} onChange={(event) => setState({ ...ownedState, reminders: event.target.checked, notice: '' })} /> 接收相关提醒</label></section>
    </section>
  );
}
