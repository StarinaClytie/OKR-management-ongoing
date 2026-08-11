import type {
  Classification,
  CompanyObjective,
  DailyReport,
  DocumentRecord,
  KeyResult,
  Milestone,
  Objective,
  Project,
  ProjectTask,
  Risk,
  WeeklyReport,
  WorkloadEntry,
} from './types';
import type { DailyEvidenceDraft } from './dailyEntry';

export type Action =
  | 'dashboard.view'
  | 'okr.read_summary'
  | 'okr.read_detail'
  | 'okr.update'
  | 'milestone.read'
  | 'risk.read'
  | 'company_objective.read'
  | 'task.read'
  | 'project.manage'
  | 'daily_report.create'
  | 'daily_report.read'
  | 'daily_report.read_body'
  | 'daily_report.edit'
  | 'daily_report.review'
  | 'weekly_report.read'
  | 'weekly_report.read_body'
  | 'worklog.read_hours'
  | 'evidence.read'
  | 'attachment.read'
  | 'document.read_body'
  | 'document.download'
  | 'record.export'
  | 'user.manage'
  | 'permission.manage'
  | 'audit.read'
  | 'user.read';

export type PermissionResource =
  | Project
  | Objective
  | KeyResult
  | Milestone
  | Risk
  | CompanyObjective
  | ProjectTask
  | DailyReport
  | WeeklyReport
  | DocumentRecord
  | WorkloadEntry
  | PermissionScope
  | UserPermissionScope
  | SystemPermissionScope;

export interface PermissionDecision {
  allowed: boolean;
  reason: string;
}

export type ResourceType =
  | 'project'
  | 'objective'
  | 'key_result'
  | 'daily_report'
  | 'daily_report_body'
  | 'evidence'
  | 'weekly_report'
  | 'user'
  | 'document'
  | 'attachment'
  | 'workload'
  | 'milestone'
  | 'risk'
  | 'company_objective'
  | 'project_task'
  | 'system';

export interface AccessControlledResource {
  resourceId: string;
  resourceType: ResourceType;
  classification: Classification;
}

export interface PermissionScope extends AccessControlledResource {
  ownerId: string;
  projectId?: string;
  parentResourceId?: string;
}

export interface UserPermissionScope extends AccessControlledResource {
  resourceType: 'user';
  ownerId: string;
  projectIds: readonly string[];
}

export type SystemAction = Extract<Action, 'dashboard.view' | 'user.manage' | 'permission.manage' | 'audit.read'>;

export interface SystemPermissionScope extends AccessControlledResource {
  resourceType: 'system';
  systemAction: SystemAction;
}

export interface ActiveShare {
  id: string;
  resourceId: string;
  resourceType: Extract<ResourceType, 'daily_report' | 'weekly_report' | 'document' | 'attachment'>;
  grantedByUserId: string;
  grantedToUserId: string;
  createdAt: string;
  active: boolean;
  allowedActions?: readonly Action[];
}

export function getDailyReportBodyPermissionScope(report: DailyReport): PermissionScope {
  return {
    resourceId: report.id,
    resourceType: 'daily_report_body',
    ownerId: report.authorId,
    projectId: report.projectId,
    classification: report.classification,
  };
}

export function getDailyReportPermissionScopes(report: DailyReport): PermissionScope[] {
  return [
    getDailyReportBodyPermissionScope(report),
    {
      resourceId: `${report.id}:evidence`,
      resourceType: 'evidence',
      ownerId: report.authorId,
      projectId: report.projectId,
      parentResourceId: report.id,
      classification: report.evidenceClassification,
    },
  ];
}

export function getDailyEvidencePermissionScope(report: DailyReport, evidence: DailyEvidenceDraft): PermissionScope {
  return {
    resourceId: `${report.id}:evidence:${evidence.id}`,
    resourceType: 'evidence',
    ownerId: report.authorId,
    projectId: report.projectId,
    parentResourceId: report.id,
    classification: evidence.classification,
  };
}

export function getAttachmentPermissionScope(attachment: DocumentRecord): PermissionScope {
  return {
    resourceId: attachment.id,
    resourceType: 'attachment',
    ownerId: attachment.ownerId,
    projectId: attachment.projectId,
    parentResourceId: attachment.relatedResourceId,
    classification: attachment.classification,
  };
}
