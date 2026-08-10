import type { Classification, DailyReport, DocumentRecord } from './types';

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
