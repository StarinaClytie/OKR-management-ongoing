import type { Action, PermissionDecision, PermissionResource, ResourceType } from '../domain/permissions';
import type { Classification, Role, User } from '../domain/types';
import { mockData } from '../mocks/repository';

export type { Action, PermissionDecision, PermissionResource } from '../domain/permissions';

const roleActions: Record<Role, ReadonlySet<Action>> = {
  administrator: new Set([
    'dashboard.view',
    'okr.read_summary',
    'okr.read_detail',
    'daily_report.read',
    'daily_report.read_body',
    'evidence.read',
    'attachment.read',
    'document.read_body',
    'document.download',
    'record.export',
    'user.manage',
    'permission.manage',
    'audit.read',
  ]),
  management: new Set([
    'dashboard.view',
    'okr.read_summary',
    'okr.read_detail',
    'okr.update',
    'milestone.read',
    'project.manage',
    'daily_report.create',
    'daily_report.read',
    'daily_report.read_body',
    'daily_report.edit',
    'daily_report.review',
    'worklog.read_hours',
    'evidence.read',
    'attachment.read',
    'document.read_body',
    'document.download',
    'record.export',
  ]),
  project_leader: new Set([
    'dashboard.view',
    'okr.read_summary',
    'okr.read_detail',
    'okr.update',
    'milestone.read',
    'project.manage',
    'daily_report.create',
    'daily_report.read',
    'daily_report.read_body',
    'daily_report.edit',
    'daily_report.review',
    'worklog.read_hours',
    'evidence.read',
    'attachment.read',
    'document.read_body',
    'document.download',
    'record.export',
  ]),
  employee: new Set([
    'dashboard.view',
    'okr.read_summary',
    'okr.read_detail',
    'okr.update',
    'milestone.read',
    'daily_report.create',
    'daily_report.read',
    'daily_report.read_body',
    'daily_report.edit',
    'worklog.read_hours',
    'evidence.read',
    'attachment.read',
    'document.read_body',
    'document.download',
  ]),
  hr: new Set(['dashboard.view', 'okr.read_summary', 'daily_report.read', 'worklog.read_hours']),
};

const systemActions = new Set<Action>(['dashboard.view', 'user.manage', 'permission.manage', 'audit.read']);

interface ResourceContext {
  id: string;
  type: ResourceType;
  ownerId?: string;
  projectId?: string;
  classification?: Classification;
  systemAction?: Action;
}

const exportableResourceTypes = new Set<ResourceType>([
  'project',
  'objective',
  'key_result',
  'daily_report',
  'weekly_report',
  'evidence',
  'document',
  'attachment',
]);

const shareableReadActions = new Set<Action>([
  'okr.read_summary',
  'okr.read_detail',
  'daily_report.read',
  'daily_report.read_body',
  'evidence.read',
  'attachment.read',
  'document.read_body',
  'document.download',
  'record.export',
]);

function deny(reason = '没有访问权限'): PermissionDecision {
  return { allowed: false, reason };
}

function allow(reason: string): PermissionDecision {
  return { allowed: true, reason };
}

function getResourceContext(resource: PermissionResource, action: Action): ResourceContext | undefined {
  if ('resourceId' in resource && 'resourceType' in resource) {
    return {
      id: resource.resourceId,
      type: resource.resourceType,
      ownerId: 'ownerId' in resource ? resource.ownerId : undefined,
      projectId: 'projectId' in resource ? resource.projectId : undefined,
      classification: resource.classification,
      systemAction: 'systemAction' in resource ? resource.systemAction : undefined,
    };
  }

  if ('kind' in resource) {
    return {
      id: resource.id,
      type: resource.kind,
      ownerId: resource.ownerId,
      projectId: resource.projectId,
      classification: resource.classification,
    };
  }

  if ('date' in resource || 'weekEnding' in resource) {
    if (action === 'evidence.read' && 'evidenceClassification' in resource) {
      return {
        id: `${resource.id}:evidence`,
        type: 'evidence',
        ownerId: resource.authorId,
        projectId: resource.projectId,
        classification: resource.evidenceClassification,
      };
    }

    return {
      id: resource.id,
      type: 'date' in resource ? 'daily_report' : 'weekly_report',
      ownerId: resource.authorId,
      projectId: resource.projectId,
      classification: resource.classification,
    };
  }

  if ('sourceReportId' in resource) {
    return {
      id: resource.sourceReportId,
      type: 'workload',
      ownerId: resource.userId,
      projectId: resource.projectId,
    };
  }

  if ('dependencyIds' in resource) {
    const objective = mockData.objectives.find((candidate) => candidate.id === resource.objectiveId);
    return {
      id: resource.id,
      type: 'milestone',
      ownerId: objective?.ownerId,
      projectId: resource.projectId,
      classification: resource.classification,
    };
  }

  if ('objectiveId' in resource && 'ownerId' in resource) {
    const objective = mockData.objectives.find((candidate) => candidate.id === resource.objectiveId);
    return {
      id: resource.id,
      type: 'key_result',
      ownerId: resource.ownerId,
      projectId: objective?.projectId,
      classification: resource.classification,
    };
  }

  if ('ownerId' in resource && 'projectId' in resource) {
    return {
      id: resource.id,
      type: 'objective',
      ownerId: resource.ownerId,
      projectId: resource.projectId,
      classification: resource.classification,
    };
  }

  if ('leaderId' in resource) {
    return {
      id: resource.id,
      type: 'project',
      ownerId: resource.leaderId,
      projectId: resource.id,
      classification: resource.classification,
    };
  }

  return undefined;
}

function isResourceCompatibleWithAction(action: Action, context: ResourceContext): boolean {
  if (systemActions.has(action)) return context.type === 'system' && context.systemAction === action;

  if (action.startsWith('okr.')) {
    return context.type === 'project' || context.type === 'objective' || context.type === 'key_result';
  }

  if (action === 'milestone.read') return context.type === 'milestone';

  if (action === 'project.manage') return context.type === 'project';
  if (action.startsWith('daily_report.')) return context.type === 'daily_report';
  if (action === 'worklog.read_hours') return context.type === 'workload' || context.type === 'daily_report';
  if (action === 'evidence.read') return context.type === 'evidence';
  if (action === 'attachment.read') return context.type === 'attachment';
  if (action === 'document.read_body' || action === 'document.download') return context.type === 'document';
  if (action === 'record.export') return exportableResourceTypes.has(context.type);

  return false;
}

function hasProjectRole(userId: string, projectId: string | undefined, membershipRole?: 'leader' | 'member'): boolean {
  if (!projectId) return false;

  return mockData.projectMemberships.some(
    (membership) =>
      membership.userId === userId &&
      membership.projectId === projectId &&
      (!membershipRole || membership.membershipRole === membershipRole),
  );
}

function isManagerOf(managerId: string, subordinateId: string | undefined): boolean {
  if (!subordinateId) return false;
  return mockData.organizationRelations.some(
    (relation) => relation.managerId === managerId && relation.subordinateId === subordinateId,
  );
}

function isSameProject(userId: string, ownerId: string | undefined, projectId: string | undefined): boolean {
  if (!ownerId || !projectId) return false;
  return hasProjectRole(userId, projectId) && hasProjectRole(ownerId, projectId);
}

function hasActiveShare(userId: string, context: ResourceContext): boolean {
  const shareResourceType = context.type === 'daily_report_body' ? 'daily_report' : context.type;

  return mockData.activeShares.some(
    (share) =>
      share.active &&
      share.grantedToUserId === userId &&
      share.resourceId === context.id &&
      share.resourceType === shareResourceType,
  );
}

function hasExplicitCollaboration(userId: string, context: ResourceContext): boolean {
  if (!context.ownerId) return false;

  return mockData.collaborationRelations.some(
    (relation) =>
      relation.viewerId === userId &&
      relation.subjectUserId === context.ownerId &&
      (!relation.projectId || relation.projectId === context.projectId) &&
      relation.sharedResourceIds.includes(context.id),
  );
}

function isIndependentFile(context: ResourceContext): boolean {
  return context.type === 'attachment' || context.type === 'document';
}

export function can(user: User | undefined, action: Action, resource?: PermissionResource): PermissionDecision {
  if (!user) return deny('需要登录');

  const capabilities = roleActions[user.role];
  if (!capabilities?.has(action)) return deny();

  if (!resource) return deny('缺少资源上下文');

  const context = getResourceContext(resource, action);
  if (!context) return deny('资源上下文不完整');
  if (!isResourceCompatibleWithAction(action, context)) return deny('操作与资源类型不匹配');

  if (systemActions.has(action)) return allow('角色具备系统权限');

  if (action === 'worklog.read_hours') {
    if (user.role === 'hr') {
      const sourceReportId = 'sourceReportId' in resource ? resource.sourceReportId : context.id;
      const hasAuthorizedHours = mockData.workloads.some(
        (workload) => workload.sourceReportId === sourceReportId && workload.hrVisibility === 'hours_only',
      );
      return hasAuthorizedHours ? allow('仅可查看授权工时字段') : deny();
    }

    if (context.ownerId === user.id || user.role === 'management' || isManagerOf(user.id, context.ownerId)) {
      return allow('可查看职责范围内工时');
    }
    if (hasProjectRole(user.id, context.projectId, 'leader')) return allow('可查看项目成员工时');
    return deny();
  }

  const explicitlyShared = shareableReadActions.has(action) && hasActiveShare(user.id, context);
  if (context.classification === 'restricted' && !explicitlyShared) {
    return deny('严格机密资源需要明确授权');
  }
  if (explicitlyShared) return allow('资源已明确共享');

  if (action === 'milestone.read') {
    if (user.role === 'management') return allow('管理层组织范围');
    return hasProjectRole(user.id, context.projectId) ? allow('所属项目里程碑') : deny();
  }

  if (action === 'okr.update') {
    return context.ownerId === user.id ? allow('可更新本人负责的 OKR') : deny();
  }

  if (action === 'daily_report.create' || action === 'daily_report.edit') {
    return context.ownerId === user.id && hasProjectRole(user.id, context.projectId)
      ? allow('可管理本人日报')
      : deny();
  }

  if (action === 'daily_report.review') {
    return context.ownerId !== user.id && hasProjectRole(user.id, context.projectId, 'leader')
      ? allow('可审核项目成员日报')
      : deny();
  }

  if (action === 'project.manage') {
    if (user.role === 'management') return allow('可管理职责范围内项目');
    return hasProjectRole(user.id, context.projectId, 'leader') ? allow('可管理负责项目') : deny();
  }

  const confidentialIndependentFile = isIndependentFile(context) && context.classification === 'confidential';
  if (confidentialIndependentFile) {
    if (context.ownerId === user.id) return allow('可访问本人文件');
    return deny('机密附件或文档需要明确授权');
  }

  if (context.ownerId === user.id) return allow('可访问本人资源');

  if (user.role === 'management') return allow('管理层组织范围');

  if (isManagerOf(user.id, context.ownerId)) return allow('直接或间接下级范围');

  const ownerManagesUser = isManagerOf(context.ownerId ?? '', user.id);
  if (isSameProject(user.id, context.ownerId, context.projectId) && !ownerManagesUser) {
    return allow('同项目成员范围');
  }

  if (ownerManagesUser) {
    return action === 'okr.read_summary' ? allow('可查看上级 OKR 摘要') : deny('上行范围仅开放 OKR 摘要');
  }

  if (hasExplicitCollaboration(user.id, context)) return allow('存在明确跨项目协作关系');

  if (context.classification === 'public' && action === 'okr.read_summary') {
    return allow('组织公开 OKR 摘要');
  }

  if (user.role === 'administrator') {
    return hasProjectRole(user.id, context.projectId)
      ? allow('管理员同时具备项目成员身份')
      : deny('系统管理权限不包含业务正文权限');
  }

  return deny();
}
