import type { Resource, ResourceDetail, ResourceProblem } from '../data/types';

// Representative demo inventory. Mutations remain unsupported in demo mode
// (matching the existing DemoOkrRepository convention); these fixtures only make
// the Resources list and detail pages render a realistic read-only preview.

export const mockResources: Resource[] = [
  {
    id: 'resource-lens-set',
    name: 'Lens Set',
    category: 'optics',
    resourceKind: 'durable',
    description: 'Assorted plano-convex and bi-convex lenses for the optics bench.',
    ownerId: 'user-project-leader',
    ownerName: '李然',
    location: 'Optics Lab / Cabinet A / Drawer 1',
    purchaseDate: '2026-05-12',
    purchaseVendor: 'Thorlabs',
    purchaseReference: 'https://www.thorlabs.com',
    usageNotes: 'Handle by the edges; store in the padded case.',
    manualUrl: 'https://www.thorlabs.com/lens-manual',
    quantity: 1,
    unit: null,
    status: 'available',
    createdAt: '2026-05-12T08:00:00Z',
    updatedAt: '2026-06-02T09:30:00Z',
    archivedAt: null,
  },
  {
    id: 'resource-vacuum-pump',
    name: 'Vacuum Pump A',
    category: 'vacuum',
    resourceKind: 'durable',
    description: 'Rotary vane pump for the clean-room vacuum line.',
    ownerId: 'user-employee',
    ownerName: '周琳',
    location: 'Clean Room / Shelf B2',
    purchaseDate: '2026-03-01',
    purchaseVendor: 'Edmund Optics',
    purchaseReference: null,
    usageNotes: 'Run the warm-up cycle for 10 minutes before use.',
    manualUrl: null,
    quantity: 1,
    unit: null,
    status: 'in_use',
    createdAt: '2026-03-01T10:00:00Z',
    updatedAt: '2026-07-18T14:00:00Z',
    archivedAt: null,
  },
  {
    id: 'resource-optical-wrench',
    name: 'Optical Table Wrench',
    category: 'tools',
    resourceKind: 'durable',
    description: '1/4-20 hex wrench for optical post mounts.',
    ownerId: 'user-management',
    ownerName: '王敏',
    location: 'Optics Lab / Cabinet A / Drawer 3',
    purchaseDate: null,
    purchaseVendor: 'Local supplier',
    purchaseReference: null,
    usageNotes: null,
    manualUrl: null,
    quantity: 1,
    unit: null,
    status: 'available',
    createdAt: '2026-04-20T09:00:00Z',
    updatedAt: '2026-04-20T09:00:00Z',
    archivedAt: null,
  },
  {
    id: 'resource-ipa-solution',
    name: 'IPA Cleaning Solution',
    category: 'chemicals',
    resourceKind: 'consumable',
    description: 'Isopropyl alcohol for cleaning optical surfaces.',
    ownerId: 'user-employee',
    ownerName: '周琳',
    location: 'Chemicals Cabinet / Shelf C',
    purchaseDate: '2026-07-10',
    purchaseVendor: 'Taobao',
    purchaseReference: null,
    usageNotes: 'Flammable; keep away from open flame.',
    manualUrl: null,
    quantity: 500,
    unit: 'mL',
    status: 'available',
    createdAt: '2026-07-10T08:00:00Z',
    updatedAt: '2026-07-10T08:00:00Z',
    archivedAt: null,
  },
];

const problemsByResource: Record<string, ResourceProblem[]> = {
  'resource-vacuum-pump': [
    {
      id: 'problem-pump-location',
      problemType: 'location_incorrect',
      description: '在 Clean Room / Shelf B2 没有找到该真空泵。',
      status: 'resolved',
      reporterId: 'user-project-peer',
      reporterName: '赵峰',
      reportedAt: '2026-07-15T10:00:00Z',
      resolvedAt: '2026-07-15T16:00:00Z',
      resolvedBy: 'user-employee',
      resolvedByName: '周琳',
      resolutionNote: 'Moved to Clean Room / Shelf B3. Resource location updated.',
      notificationStatus: 'sent',
      notificationErrorCode: null,
    },
    {
      id: 'problem-pump-malfunction',
      problemType: 'malfunction',
      description: '泵启动时有异常噪音。',
      status: 'open',
      reporterId: 'user-project-leader',
      reporterName: '李然',
      reportedAt: '2026-08-02T11:00:00Z',
      resolvedAt: null,
      resolvedBy: null,
      resolvedByName: null,
      resolutionNote: null,
      notificationStatus: 'failed',
      notificationErrorCode: 'email_not_configured',
    },
  ],
};

const attachmentNames: Record<string, Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number }>> = {
  'resource-lens-set': [
    { id: 'attachment-lens-manual', fileName: 'lens-set-manual.pdf', mimeType: 'application/pdf', sizeBytes: 102400 },
  ],
};

export function getMockResourceDetail(resourceId: string): ResourceDetail | null {
  const resource = mockResources.find((candidate) => candidate.id === resourceId);
  if (!resource) return null;
  const problems = problemsByResource[resourceId] ?? [];
  const attachments = (attachmentNames[resourceId] ?? []).map((attachment) => ({
    id: attachment.id,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    createdAt: resource.createdAt,
  }));
  return { ...resource, attachments, problems };
}
