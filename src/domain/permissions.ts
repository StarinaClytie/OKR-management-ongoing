import type { Classification } from './types';

export type ResourceType =
  | 'project'
  | 'objective'
  | 'key_result'
  | 'daily_report'
  | 'weekly_report'
  | 'document'
  | 'attachment'
  | 'workload';

export interface AccessControlledResource {
  id: string;
  resourceType: ResourceType;
  classification: Classification;
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
