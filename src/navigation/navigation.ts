import {
  BarChart3,
  ClipboardList,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Settings,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Action, SystemPermissionScope } from '../domain/permissions';

export interface NavigationItem {
  path: string;
  label: string;
  icon: LucideIcon;
  action: Action;
  resource: SystemPermissionScope;
}

const dashboardScope: SystemPermissionScope = {
  resourceId: 'system-dashboard',
  resourceType: 'system',
  classification: 'internal',
  systemAction: 'dashboard.view',
};

const settingsScope: SystemPermissionScope = {
  resourceId: 'system-settings',
  resourceType: 'system',
  classification: 'internal',
  systemAction: 'permission.manage',
};

export const navigationItems: readonly NavigationItem[] = [
  { path: '/dashboard', label: '仪表盘', icon: LayoutDashboard, action: 'dashboard.view', resource: dashboardScope },
  { path: '/okrs', label: 'OKR 管理', icon: Target, action: 'dashboard.view', resource: dashboardScope },
  { path: '/projects', label: '项目', icon: FolderKanban, action: 'dashboard.view', resource: dashboardScope },
  { path: '/daily-reports', label: '日报', icon: ClipboardList, action: 'dashboard.view', resource: dashboardScope },
  { path: '/weekly-reports', label: '周报', icon: FileText, action: 'dashboard.view', resource: dashboardScope },
  { path: '/team', label: '团队', icon: Users, action: 'dashboard.view', resource: dashboardScope },
  { path: '/analytics', label: '分析', icon: BarChart3, action: 'dashboard.view', resource: dashboardScope },
  { path: '/settings', label: '设置', icon: Settings, action: 'permission.manage', resource: settingsScope },
];
