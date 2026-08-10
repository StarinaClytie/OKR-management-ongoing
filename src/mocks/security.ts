import type { ActiveShare } from '../domain/permissions';
import type { CollaborationRelation, DocumentRecord } from '../domain/types';

export const attachments: DocumentRecord[] = [
  {
    id: 'attachment-public-orion-brief',
    title: '星图项目公开简介.pdf',
    classification: 'public',
    ownerId: 'user-project-leader',
    projectId: 'project-orion',
    relatedResourceId: 'daily-report-leader-2026-08-07',
    relatedResourceType: 'daily_report',
    kind: 'attachment',
    uploadedAt: '2026-08-07T09:00:00Z',
  },
  {
    id: 'attachment-internal-orion-notes',
    title: '引导文案访谈纪要.docx',
    classification: 'internal',
    ownerId: 'user-employee',
    projectId: 'project-orion',
    relatedResourceId: 'daily-report-employee-2026-08-07',
    relatedResourceType: 'daily_report',
    kind: 'attachment',
    uploadedAt: '2026-08-07T12:00:00Z',
  },
  {
    id: 'attachment-public-orion-weekly-summary',
    title: '星图项目周度摘要.pdf',
    classification: 'public',
    ownerId: 'user-project-leader',
    projectId: 'project-orion',
    relatedResourceId: 'weekly-report-orion-2026-08-07',
    relatedResourceType: 'weekly_report',
    kind: 'attachment',
    uploadedAt: '2026-08-07T18:00:00Z',
  },
  {
    id: 'attachment-confidential-orion-evidence',
    title: '客户实验证据包.xlsx',
    classification: 'confidential',
    ownerId: 'user-employee',
    projectId: 'project-orion',
    relatedResourceId: 'daily-report-employee-2026-08-07',
    relatedResourceType: 'daily_report',
    kind: 'attachment',
    uploadedAt: '2026-08-07T14:00:00Z',
  },
  {
    id: 'attachment-restricted-nova-access',
    title: '数据访问审批记录.pdf',
    classification: 'restricted',
    ownerId: 'user-project-peer',
    projectId: 'project-nova',
    relatedResourceId: 'daily-report-peer-2026-08-07',
    relatedResourceType: 'daily_report',
    kind: 'attachment',
    uploadedAt: '2026-08-07T16:00:00Z',
  },
  {
    id: 'attachment-confidential-nova-quality',
    title: '数据质量周度校验结果.xlsx',
    classification: 'confidential',
    ownerId: 'user-project-peer',
    projectId: 'project-nova',
    relatedResourceId: 'weekly-report-nova-2026-08-07',
    relatedResourceType: 'weekly_report',
    kind: 'attachment',
    uploadedAt: '2026-08-07T16:30:00Z',
  },
];

export const documents: DocumentRecord[] = [
  ...attachments,
  {
    id: 'document-nova-metric-contract',
    title: '经营指标口径合同.pdf',
    classification: 'confidential',
    ownerId: 'user-management',
    projectId: 'project-nova',
    relatedResourceId: 'objective-nova-trust',
    relatedResourceType: 'objective',
    kind: 'document',
    uploadedAt: '2026-08-06T10:00:00Z',
  },
];

export const collaborationRelations: CollaborationRelation[] = [
  {
    viewerId: 'user-employee',
    subjectUserId: 'user-project-peer',
    projectId: 'project-nova',
    sharedResourceIds: ['daily-report-peer-2026-08-07'],
  },
];

export const activeShares: ActiveShare[] = [
  {
    id: 'share-nova-report-to-orion',
    resourceId: 'daily-report-peer-2026-08-07',
    resourceType: 'daily_report',
    grantedByUserId: 'user-project-peer',
    grantedToUserId: 'user-employee',
    createdAt: '2026-08-07T17:00:00Z',
    active: true,
  },
];
