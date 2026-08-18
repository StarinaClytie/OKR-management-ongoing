import type { ResourceCategory, ResourceKind, ResourceProblemStatus, ResourceProblemType, ResourceStatus } from '../domain/types';
import type { MessageKey } from '../i18n/messages';

export const resourceCategoryKeys: Record<ResourceCategory, MessageKey> = {
  optics: 'resource.category.optics',
  chemicals: 'resource.category.chemicals',
  vacuum: 'resource.category.vacuum',
  tools: 'resource.category.tools',
  electronics: 'resource.category.electronics',
  mechanical: 'resource.category.mechanical',
  consumables: 'resource.category.consumables',
  safety: 'resource.category.safety',
  other: 'resource.category.other',
};

export const resourceKindKeys: Record<ResourceKind, MessageKey> = {
  durable: 'resource.kind.durable',
  consumable: 'resource.kind.consumable',
};

export const resourceStatusKeys: Record<ResourceStatus, MessageKey> = {
  available: 'resource.status.available',
  in_use: 'resource.status.in_use',
  maintenance: 'resource.status.maintenance',
  damaged: 'resource.status.damaged',
  missing: 'resource.status.missing',
  out_of_stock: 'resource.status.out_of_stock',
  archived: 'resource.status.archived',
};

export const resourceProblemTypeKeys: Record<ResourceProblemType, MessageKey> = {
  location_incorrect: 'resource.problemType.location_incorrect',
  missing: 'resource.problemType.missing',
  damaged: 'resource.problemType.damaged',
  malfunction: 'resource.problemType.malfunction',
  quantity_incorrect: 'resource.problemType.quantity_incorrect',
  manual_issue: 'resource.problemType.manual_issue',
  other: 'resource.problemType.other',
};

export const resourceProblemStatusKeys: Record<ResourceProblemStatus, MessageKey> = {
  open: 'resource.problemStatus.open',
  resolved: 'resource.problemStatus.resolved',
};

export const resourceCategories: readonly ResourceCategory[] = ['optics', 'chemicals', 'vacuum', 'tools', 'electronics', 'mechanical', 'consumables', 'safety', 'other'];
export const resourceKinds: readonly ResourceKind[] = ['durable', 'consumable'];
export const resourceStatuses: readonly ResourceStatus[] = ['available', 'in_use', 'maintenance', 'damaged', 'missing', 'out_of_stock'];
export const resourceProblemTypes: readonly ResourceProblemType[] = ['location_incorrect', 'missing', 'damaged', 'malfunction', 'quantity_incorrect', 'manual_issue', 'other'];
