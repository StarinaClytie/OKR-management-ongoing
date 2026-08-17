import { PermissionGate } from '../../auth/PermissionGate';
import { MetricCard } from '../../components/MetricCard';
import type { SystemAction, SystemPermissionScope } from '../../domain/permissions';
import { useLocale } from '../../i18n/LocaleProvider';

function systemResource(systemAction: SystemAction): SystemPermissionScope {
  return {
    resourceId: `dashboard:${systemAction}`,
    resourceType: 'system',
    classification: 'internal',
    systemAction,
  };
}

export function AdminSystemWidget() {
  const { t } = useLocale();
  return (
    <PermissionGate action="audit.read" resource={systemResource('audit.read')}>
      <section className="dashboard-widget dashboard-widget--wide" aria-labelledby="admin-system-title">
        <div className="dashboard-widget__header">
          <div>
            <p className="dashboard-widget__eyebrow">{t('widget.systemMetadata')}</p>
            <h2 id="admin-system-title">{t('widget.userRoleStatus')}</h2>
          </div>
        </div>
        <div className="dashboard-metrics">
          <PermissionGate action="user.manage" resource={systemResource('user.manage')}>
            <MetricCard label={t('widget.activeAccounts')} value={6} detail={t('widget.organizationAccounts')} />
          </PermissionGate>
          <PermissionGate action="permission.manage" resource={systemResource('permission.manage')}>
            <MetricCard label={t('widget.permissionExceptions')} value={1} detail={t('widget.permissionReview')} />
          </PermissionGate>
          <PermissionGate action="audit.read" resource={systemResource('audit.read')}>
            <MetricCard label={t('widget.auditEvents')} value={12} detail={t('widget.operationMetadata')} />
          </PermissionGate>
        </div>
        <div className="system-status">
          <strong>{t('widget.systemConfigStatus')}</strong>
          <span>{t('widget.systemHealthy')}</span>
        </div>
        <p className="dashboard-widget__notice">{t('widget.adminScopeNotice')}</p>
      </section>
    </PermissionGate>
  );
}
