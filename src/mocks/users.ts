import type { OrganizationRelation, ProjectMembership, User } from '../domain/types';

export const users: User[] = [
  {
    id: 'user-administrator',
    name: '陈安',
    role: 'administrator',
    title: '系统管理员',
    department: '信息技术部',
    projectIds: [],
  },
  {
    id: 'user-management',
    name: '王敏',
    role: 'management',
    title: '运营总监',
    department: '管理层',
    projectIds: ['project-nova'],
  },
  {
    id: 'user-project-leader',
    name: '李然',
    role: 'project_leader',
    title: '项目负责人',
    department: '产品部',
    projectIds: ['project-orion'],
  },
  {
    id: 'user-employee',
    name: '周琳',
    role: 'employee',
    title: '产品经理',
    department: '产品部',
    projectIds: ['project-orion'],
  },
  {
    id: 'user-project-peer',
    name: '赵峰',
    role: 'employee',
    title: '数据分析师',
    department: '数据部',
    projectIds: ['project-nova', 'project-orion'],
  },
  {
    id: 'user-hr',
    name: '孙悦',
    role: 'hr',
    title: '人力伙伴',
    department: '人力资源部',
    projectIds: ['project-nova'],
  },
];

export const organizationRelations: OrganizationRelation[] = [
  { managerId: 'user-management', subordinateId: 'user-project-leader', depth: 1 },
  { managerId: 'user-project-leader', subordinateId: 'user-employee', depth: 1 },
  { managerId: 'user-management', subordinateId: 'user-employee', depth: 2 },
  { managerId: 'user-management', subordinateId: 'user-project-peer', depth: 1 },
  { managerId: 'user-management', subordinateId: 'user-hr', depth: 1 },
];

export const projectMemberships: ProjectMembership[] = [
  { id: 'membership-orion-leader', projectId: 'project-orion', userId: 'user-project-leader', membershipRole: 'leader' },
  { id: 'membership-orion-employee', projectId: 'project-orion', userId: 'user-employee', membershipRole: 'member' },
  { id: 'membership-orion-peer', projectId: 'project-orion', userId: 'user-project-peer', membershipRole: 'member' },
  { id: 'membership-nova-management', projectId: 'project-nova', userId: 'user-management', membershipRole: 'leader' },
  { id: 'membership-nova-peer', projectId: 'project-nova', userId: 'user-project-peer', membershipRole: 'member' },
  { id: 'membership-nova-hr', projectId: 'project-nova', userId: 'user-hr', membershipRole: 'member' },
];
