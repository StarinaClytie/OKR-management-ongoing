import type {
  Classification,
  DailyReport,
  DocumentRecord,
  KeyResult,
  Objective,
  Project,
  WeeklyReport,
  WorkloadEntry,
} from './types';

export type Action =
  | 'dashboard.view'
  | 'okr.read_summary'
  | 'okr.read_detail'
  | 'okr.update'
  | 'project.manage'
  | 'daily_report.create'
  | 'daily_report.read'
  | 'daily_report.read_body'
  | 'daily_report.edit'
  | 'daily_report.review'
  | 'worklog.read_hours'
  | 'evidence.read'
  | 'attachment.read'
  | 'document.read_body'
  | 'document.download'
  | 'record.export'
  | 'user.manage'
  | 'permission.manage'
  | 'audit.read';

export type PermissionResource =
  | Project
  | Objective
  | KeyResult
  | DailyReport
  | WeeklyReport
  | DocumentRecord
  | WorkloadEntry
  | PermissionScope;

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
  | 'document'
  | 'attachment'
  | 'workload';

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

export interface ActiveShare {
  id: string;
  resourceId: string;
  resourceType: Extract<ResourceType, 'daily_report' | 'weekly_report' | 'document' | 'attachment'>;
  grantedByUserId: string;
  grantedToUserId: string;
  createdAt: string;
  active: boolean;
}

export function getDailyReportPermissionScopes(report: DailyReport): PermissionScope[] {
  return [
    {
      resourceId: report.id,
      resourceType: 'daily_report_body',
      ownerId: report.authorId,
      projectId: report.projectId,
      classification: report.classification,
    },
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
