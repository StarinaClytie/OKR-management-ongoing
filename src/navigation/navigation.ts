import {
  BarChart3,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Package,
  Settings,
  Target,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Action, SystemPermissionScope } from '../domain/permissions';
import type { Role } from '../domain/types';
import type { MessageKey } from '../i18n/messages';

export interface NavigationItem {
  path: string;
  labelKey: MessageKey;
  icon: LucideIcon;
  action: Action;
  resource: SystemPermissionScope;
  /** Roles that see this item. Omitted = visible to every role. */
  roles?: readonly Role[];
}

const dashboardScope: SystemPermissionScope = {
  resourceId: 'system-dashboard',
  resourceType: 'system',
  classification: 'internal',
  systemAction: 'dashboard.view',
};

const usersScope: SystemPermissionScope = {
  resourceId: 'system-users',
  resourceType: 'system',
  classification: 'internal',
  systemAction: 'user.manage',
};

const okrRoles: readonly Role[] = ['management', 'project_leader', 'employee'];
export const resourceRoles: readonly Role[] = ['management', 'project_leader', 'administrator'];
const analyticsRoles: readonly Role[] = ['management', 'project_leader', 'employee', 'hr', 'administrator'];
const adminRoles: readonly Role[] = ['administrator'];

export const navigationItems: readonly NavigationItem[] = [
  { path: '/dashboard', labelKey: 'navigation.dashboard', icon: LayoutDashboard, action: 'dashboard.view', resource: dashboardScope },
  { path: '/okrs', labelKey: 'navigation.okrs', icon: Target, action: 'dashboard.view', resource: dashboardScope, roles: okrRoles },
  { path: '/projects', labelKey: 'navigation.projects', icon: FolderKanban, action: 'dashboard.view', resource: dashboardScope, roles: okrRoles },
  { path: '/resources', labelKey: 'navigation.resources', icon: Package, action: 'dashboard.view', resource: dashboardScope, roles: resourceRoles },
  { path: '/reports', labelKey: 'navigation.reports', icon: FileText, action: 'dashboard.view', resource: dashboardScope },
  { path: '/team', labelKey: 'navigation.team', icon: Users, action: 'dashboard.view', resource: dashboardScope },
  { path: '/users', labelKey: 'navigation.users', icon: UserCog, action: 'user.manage', resource: usersScope, roles: adminRoles },
  { path: '/analytics', labelKey: 'navigation.analytics', icon: BarChart3, action: 'dashboard.view', resource: dashboardScope, roles: analyticsRoles },
  { path: '/settings', labelKey: 'navigation.settings', icon: Settings, action: 'dashboard.view', resource: dashboardScope },
];
