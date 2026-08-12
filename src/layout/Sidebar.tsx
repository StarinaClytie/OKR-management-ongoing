import { X } from 'lucide-react';
import type { Ref } from 'react';
import { NavLink } from 'react-router-dom';
import { PermissionGate } from '../auth/PermissionGate';
import { navigationItems } from '../navigation/navigation';

export interface SidebarProps {
  variant: 'desktop' | 'mobile';
  mobileOpen?: boolean;
  onNavigate: () => void;
  onClose?: () => void;
  drawerRef?: Ref<HTMLElement>;
}

export function Sidebar({ variant, mobileOpen = false, onNavigate, onClose, drawerRef }: SidebarProps) {
  const isMobileDrawer = variant === 'mobile';
  const dashboardPath = navigationItems[0].path;

  return (
    <aside
      ref={drawerRef}
      className={`app-sidebar app-sidebar--${variant}${mobileOpen ? ' app-sidebar--open' : ''}`}
      aria-label={isMobileDrawer ? '移动端主导航' : '主导航'}
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
          aria-label="关闭导航"
          onClick={onClose}
        >
          <X size={20} aria-hidden="true" />
        </button>
      ) : null}
      <NavLink className="app-brand" to={dashboardPath} onClick={onNavigate}>
        <span className="app-brand__mark" aria-hidden="true">N</span>
        <span>Northstar OKR</span>
      </NavLink>

      <nav className="app-sidebar__nav" aria-label="工作区">
        {navigationItems.map((item) => {
          const Icon = item.icon;

          return (
            <PermissionGate key={item.path} action={item.action} resource={item.resource}>
              <NavLink
                className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link--active' : ''}`}
                to={item.path}
                onClick={onNavigate}
              >
                <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
                <span>{item.label}</span>
              </NavLink>
            </PermissionGate>
          );
        })}
      </nav>
    </aside>
  );
}
