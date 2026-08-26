import {
  Clock,
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
const okrViewRoles: readonly Role[] = ['management', 'project_leader', 'employee', 'hr'];
const hrHoursRoles: readonly Role[] = ['hr'];
const teamRoles: readonly Role[] = ['management', 'project_leader', 'employee', 'administrator'];
export const resourceRoles: readonly Role[] = ['management', 'project_leader', 'administrator', 'employee', 'hr'];
const adminRoles: readonly Role[] = ['administrator'];

export const navigationItems: readonly NavigationItem[] = [
  { path: '/dashboard', labelKey: 'navigation.dashboard', icon: LayoutDashboard, action: 'dashboard.view', resource: dashboardScope },
  { path: '/okrs', labelKey: 'navigation.okrs', icon: Target, action: 'dashboard.view', resource: dashboardScope, roles: okrViewRoles },
  { path: '/projects', labelKey: 'navigation.projects', icon: FolderKanban, action: 'dashboard.view', resource: dashboardScope, roles: okrRoles },
  { path: '/resources', labelKey: 'navigation.resources', icon: Package, action: 'dashboard.view', resource: dashboardScope },
  { path: '/reports', labelKey: 'navigation.reports', icon: FileText, action: 'dashboard.view', resource: dashboardScope },
  { path: '/team', labelKey: 'navigation.team', icon: Users, action: 'dashboard.view', resource: dashboardScope, roles: teamRoles },
  { path: '/hr-hours', labelKey: 'navigation.hrHours', icon: Clock, action: 'dashboard.view', resource: dashboardScope, roles: hrHoursRoles },
  { path: '/users', labelKey: 'navigation.users', icon: UserCog, action: 'user.manage', resource: usersScope, roles: adminRoles },
  { path: '/settings', labelKey: 'navigation.settings', icon: Settings, action: 'dashboard.view', resource: dashboardScope },
];
