import { PermissionGate } from '../../auth/PermissionGate';
import { MetricCard } from '../../components/MetricCard';
import type { DashboardData } from '../../data/types';
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

export function AdminSystemWidget({ data }: { data: DashboardData }) {
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
            <MetricCard label={t('widget.activeAccounts')} value={data.users.length} detail={t('widget.organizationAccounts')} />
          </PermissionGate>
        </div>
        <p className="dashboard-widget__notice">{t('widget.adminScopeNotice')}</p>
      </section>
    </PermissionGate>
  );
}
