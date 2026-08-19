import { X } from 'lucide-react';
import type { Ref } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { PermissionGate } from '../auth/PermissionGate';
import { navigationItems } from '../navigation/navigation';
import { useLocale } from '../i18n/LocaleProvider';

export interface SidebarProps {
  variant: 'desktop' | 'mobile';
  mobileOpen?: boolean;
  onNavigate: () => void;
  onClose?: () => void;
  drawerRef?: Ref<HTMLElement>;
}

export function Sidebar({ variant, mobileOpen = false, onNavigate, onClose, drawerRef }: SidebarProps) {
  const { t } = useLocale();
  const { currentUser } = useAuth();
  const isMobileDrawer = variant === 'mobile';
  const dashboardPath = navigationItems[0].path;
  const visibleItems = navigationItems.filter((item) => !item.roles || (currentUser && item.roles.includes(currentUser.role)));

  return (
    <aside
      ref={drawerRef}
      className={`app-sidebar app-sidebar--${variant}${mobileOpen ? ' app-sidebar--open' : ''}`}
      aria-label={isMobileDrawer ? t('navigation.mobile') : t('navigation.primary')}
      aria-hidden={isMobileDrawer && !mobileOpen ? true : undefined}
      aria-modal={isMobileDrawer && mobileOpen ? true : undefined}
      role={isMobileDrawer && mobileOpen ? 'dialog' : undefined}
      inert={isMobileDrawer && !mobileOpen}
    >
      {isMobileDrawer ? (
        <button
          className="icon-button app-sidebar__close"
          data-drawer-close
          type="button"
          aria-label={t('navigation.close')}
          onClick={onClose}
        >
          <X size={20} aria-hidden="true" />
        </button>
      ) : null}
      <NavLink className="app-brand" to={dashboardPath} onClick={onNavigate}>
        <span className="app-brand__mark" aria-hidden="true">N</span>
        <span>Northstar OKR</span>
      </NavLink>

      <nav className="app-sidebar__nav" aria-label={t('navigation.workspace')}>
        {visibleItems.map((item) => {
          const Icon = item.icon;

          return (
            <PermissionGate key={item.path} action={item.action} resource={item.resource}>
              <NavLink
                className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link--active' : ''}`}
                to={item.path}
                onClick={onNavigate}
              >
                <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
                <span>{t(item.labelKey)}</span>
              </NavLink>
            </PermissionGate>
          );
        })}
      </nav>
    </aside>
  );
}
