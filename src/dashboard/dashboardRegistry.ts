import type { Role } from '../domain/types';
import type { DashboardConfig } from './types';

const dashboardRegistry: Record<Role, DashboardConfig> = {
  administrator: {
    role: 'administrator',
    title: '系统治理概览',
    description: '关注用户、权限、审计和系统配置状态。',
    widgetIds: ['admin-system'],
  },
  management: {
    role: 'management',
    title: '组织经营概览',
    description: '快速掌握公司目标健康度和需要关注的风险。',
    widgetIds: ['company-health', 'project-visualizations'],
  },
  project_leader: {
    role: 'project_leader',
    title: '项目执行概览',
    description: '先完成今天的工作，再跟进本人 KR 和项目成员。',
    widgetIds: ['today-focus', 'my-key-results', 'report-review', 'project-visualizations'],
  },
  employee: {
    role: 'employee',
    title: '我的工作概览',
    description: '聚焦今日任务、本人 OKR 和下一步行动。',
    widgetIds: ['today-focus', 'my-key-results'],
  },
  hr: {
    role: 'hr',
    title: '人力与投入概览',
    description: '查看授权范围内的人员投入和团队负载摘要。',
    widgetIds: ['hr-summary', 'project-visualizations'],
  },
};

export function getDashboardConfig(role: Role): DashboardConfig {
  const config = dashboardRegistry[role];

  if (!config) {
    throw new Error('未知角色');
  }

  return config;
}
