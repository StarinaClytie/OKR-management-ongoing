import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import type { Ref } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { PermissionGate } from '../auth/PermissionGate';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { navigationItems } from '../navigation/navigation';
import { useLocale } from '../i18n/LocaleProvider';
import { AccountMenu } from './AccountMenu';

interface SidebarSharedProps {
  onNavigate: () => void;
}

interface DesktopSidebarProps extends SidebarSharedProps {
  variant: 'desktop';
  collapsed: boolean;
  onCollapsedChange(next: boolean): void;
}

interface MobileSidebarProps extends SidebarSharedProps {
  variant: 'mobile';
  mobileOpen?: boolean;
  onClose?: () => void;
  drawerRef?: Ref<HTMLElement>;
}

export type SidebarProps = DesktopSidebarProps | MobileSidebarProps;

export function Sidebar(props: SidebarProps) {
  const { t } = useLocale();
  const { currentUser, mode } = useAuth();
  const isMobileDrawer = props.variant === 'mobile';
  const collapsed = props.variant === 'desktop' ? props.collapsed : false;
  const mobileOpen = props.variant === 'mobile' ? props.mobileOpen ?? false : false;
  const drawerRef = props.variant === 'mobile' ? props.drawerRef : undefined;
  const dashboardPath = navigationItems[0].path;
  const visibleItems = navigationItems.filter((item) => !item.roles || (currentUser && item.roles.includes(currentUser.role)));
  const collapseLabel = collapsed ? t('navigation.expandSidebar') : t('navigation.collapseSidebar');

  return (
    <aside
      ref={drawerRef}
      className={`app-sidebar app-sidebar--${props.variant}${mobileOpen ? ' app-sidebar--open' : ''}${collapsed ? ' app-sidebar--collapsed' : ''}`}
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
          onClick={props.onClose}
        >
          <X size={20} aria-hidden="true" />
        </button>
      ) : null}
      <NavLink className="app-brand" to={dashboardPath} onClick={props.onNavigate} title={collapsed ? '瞬谱光电 TIME-TECH SPECTRA' : undefined}>
        <span className="app-brand__mark" aria-hidden="true">T</span>
        <span className={collapsed ? 'sr-only' : undefined}>瞬谱光电 TIME-TECH SPECTRA</span>
      </NavLink>

      <nav className="app-sidebar__nav" aria-label={t('navigation.workspace')}>
        {visibleItems.map((item) => {
          const Icon = item.icon;

          return (
            <PermissionGate key={item.path} action={item.action} resource={item.resource}>
              <NavLink
                className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link--active' : ''}`}
                to={item.path}
                onClick={props.onNavigate}
                title={collapsed ? t(item.labelKey) : undefined}
              >
                <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
                <span className={collapsed ? 'sr-only' : undefined}>{t(item.labelKey)}</span>
              </NavLink>
            </PermissionGate>
          );
        })}
      </nav>

      <div className="app-sidebar__utilities">
        {mode === 'supabase' ? <AccountMenu compact={collapsed} onNavigate={props.onNavigate} /> : null}
        <LanguageSwitcher />
        {props.variant === 'desktop' ? (
          <button
            className="app-sidebar__collapse"
            type="button"
            aria-label={collapseLabel}
            aria-expanded={!collapsed}
            title={collapseLabel}
            onClick={() => props.onCollapsedChange(!collapsed)}
          >
            {collapsed
              ? <PanelLeftOpen size={19} aria-hidden="true" />
              : <PanelLeftClose size={19} aria-hidden="true" />}
            <span className={collapsed ? 'sr-only' : undefined}>{collapseLabel}</span>
          </button>
        ) : null}
      </div>
    </aside>
  );
}
