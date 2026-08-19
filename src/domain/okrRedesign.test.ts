import { describe, expect, it } from 'vitest';
import { isKrOwner, ownersOfKr } from './krAssignments';
import type { KrAssignment } from './types';
import { configurePermissionSource } from '../auth/permissionService';
import { mockData, mockRepository } from '../mocks/repository';
import { aggregateRecordedHours } from '../dashboard/widgets/hoursFiltering';
import { DemoOkrRepository } from '../data/demoRepository';

describe('multi-owner KR assignments', () => {
  const assignments: KrAssignment[] = [
    { id: 'a1', krId: 'kr-1', userId: 'user-a', assignmentRole: 'owner' },
    { id: 'a2', krId: 'kr-1', userId: 'user-b', assignmentRole: 'owner' },
  ];

  it('returns every owner for a KR', () => {
    expect(ownersOfKr('kr-1', assignments)).toEqual(['user-a', 'user-b']);
  });

  it('recognizes any owner, not only the canonical first owner', () => {
    expect(isKrOwner('user-a', 'kr-1', assignments)).toBe(true);
    expect(isKrOwner('user-b', 'kr-1', assignments)).toBe(true);
    expect(isKrOwner('user-c', 'kr-1', assignments)).toBe(false);
  });
});

describe('multi-owner KR persistence', () => {
  it('persists two owners as owner assignments via the demo repository', async () => {
    const repository = new DemoOkrRepository();
    const result = await repository.createKeyResult({
      objectiveId: 'objective-spectrometer',
      title: '完成多负责人 KR',
      ownerIds: ['user-wang-fang', 'user-chen-hao'],
      dueDate: '2026-09-30',
      metricType: 'milestone',
      classification: 'internal',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const dashboard = await repository.getDashboardData('user-management');
    if (!dashboard.ok) return;
    const owners = ownersOfKr(result.data.id, dashboard.data.krAssignments);
    expect(owners).toEqual(['user-wang-fang', 'user-chen-hao']);
  });
});

describe('recorded-hours aggregation', () => {
  it('aggregates management-visible Daily OKR block hours by employee with an O/KR breakdown', () => {
    configurePermissionSource(mockData);
    const source = mockRepository.getDashboardData('user-management');
    const data = {
      ...source,
      dailyReports: [{
        id: 'report-1', authorId: 'user-wang-fang', projectId: 'project-spectrometer', objectiveId: 'objective-spectrometer',
        keyResultIds: ['kr-spec-snr', 'kr-ai-data'], date: '2026-08-19', content: '', classification: 'internal' as const,
        hours: 6, evidence: [], evidenceClassification: 'internal' as const, attachmentIds: [], status: 'submitted' as const,
        blocks: [
          { id: 'b1', dailyObjective: '完成采集第一阶段', keyResultId: 'kr-spec-snr', hours: 3.5, result: '', keyResults: [{ id: 'k1', title: '完成样本 A' }] },
          { id: 'b2', dailyObjective: '完成数据整理', keyResultId: 'kr-ai-data', hours: 2.5, result: '', keyResults: [{ id: 'k2', title: '清洗异常值' }] },
        ],
      }],
    };

    const employees = aggregateRecordedHours(data);
    expect(employees).toHaveLength(1);
    expect(employees[0]).toMatchObject({ userId: 'user-wang-fang', total: 6 });
    expect(employees[0]!.breakdown).toEqual([
      { objectiveId: 'objective-spectrometer', keyResultId: 'kr-spec-snr', hours: 3.5 },
      { objectiveId: 'objective-ai-inspection', keyResultId: 'kr-ai-data', hours: 2.5 },
    ]);
  });
});
