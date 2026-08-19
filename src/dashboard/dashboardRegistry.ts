import type { Role } from '../domain/types';
import type { DashboardConfig } from './types';

const dashboardRegistry: Record<Role, DashboardConfig> = {
  administrator: {
    role: 'administrator',
    titleKey: 'dashboard.adminTitle',
    descriptionKey: 'dashboard.adminDescription',
    widgetIds: ['admin-system'],
  },
  management: {
    role: 'management',
    titleKey: 'dashboard.managementTitle',
    descriptionKey: 'dashboard.managementDescription',
    widgetIds: ['company-health'],
  },
  project_leader: {
    role: 'project_leader',
    titleKey: 'dashboard.leaderTitle',
    descriptionKey: 'dashboard.leaderDescription',
    widgetIds: ['today-focus', 'my-key-results', 'report-review'],
  },
  employee: {
    role: 'employee',
    titleKey: 'dashboard.employeeTitle',
    descriptionKey: 'dashboard.employeeDescription',
    widgetIds: ['today-focus', 'my-key-results'],
  },
  hr: {
    role: 'hr',
    titleKey: 'dashboard.hrTitle',
    descriptionKey: 'dashboard.hrDescription',
    widgetIds: ['hr-summary'],
  },
};

export function getDashboardConfig(role: Role): DashboardConfig {
  const config = dashboardRegistry[role];

  if (!config) {
    throw new Error('未知角色');
  }

  return config;
}
