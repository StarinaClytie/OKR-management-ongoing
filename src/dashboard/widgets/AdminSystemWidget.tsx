import { PermissionGate } from '../../auth/PermissionGate';
import { MetricCard } from '../../components/MetricCard';
import type { SystemAction, SystemPermissionScope } from '../../domain/permissions';

function systemResource(systemAction: SystemAction): SystemPermissionScope {
  return {
    resourceId: `dashboard:${systemAction}`,
    resourceType: 'system',
    classification: 'internal',
    systemAction,
  };
}

export function AdminSystemWidget() {
  return (
    <PermissionGate action="audit.read" resource={systemResource('audit.read')}>
      <section className="dashboard-widget dashboard-widget--wide" aria-labelledby="admin-system-title">
        <div className="dashboard-widget__header">
          <div>
            <p className="dashboard-widget__eyebrow">系统元数据</p>
            <h2 id="admin-system-title">用户与角色状态</h2>
          </div>
        </div>
        <div className="dashboard-metrics">
          <PermissionGate action="user.manage" resource={systemResource('user.manage')}>
            <MetricCard label="活跃账号" value={6} detail="模拟组织账号" />
          </PermissionGate>
          <PermissionGate action="permission.manage" resource={systemResource('permission.manage')}>
            <MetricCard label="待处理权限异常" value={1} detail="需要核查授权范围" />
          </PermissionGate>
          <PermissionGate action="audit.read" resource={systemResource('audit.read')}>
            <MetricCard label="今日审计事件" value={12} detail="系统操作元数据" />
          </PermissionGate>
        </div>
        <div className="system-status">
          <strong>系统配置状态</strong>
          <span>权限规则与审计记录服务运行正常</span>
        </div>
        <p className="dashboard-widget__notice">系统治理视图不包含项目正文、成员日报或业务附件。</p>
      </section>
    </PermissionGate>
  );
}
