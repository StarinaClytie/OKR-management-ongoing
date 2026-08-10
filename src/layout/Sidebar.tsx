import { NavLink } from 'react-router-dom';
import { PermissionGate } from '../auth/PermissionGate';
import { navigationItems } from '../navigation/navigation';

export interface SidebarProps {
  mobileOpen: boolean;
  onNavigate: () => void;
}

export function Sidebar({ mobileOpen, onNavigate }: SidebarProps) {
  return (
    <aside className={`app-sidebar${mobileOpen ? ' app-sidebar--open' : ''}`} aria-label="主导航">
      <NavLink className="app-brand" to="/dashboard" onClick={onNavigate}>
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
