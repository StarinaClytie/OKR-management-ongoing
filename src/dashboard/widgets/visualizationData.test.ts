import { mockRepository } from '../../mocks/repository';
import { prepareVisualizationData } from './visualizationData';

describe('prepareVisualizationData', () => {
  it('filters restricted records before labels or aggregates are produced', () => {
    const source = mockRepository.getDashboardData('user-project-leader');
    const secret = '严格机密侧信道标签';
    const data = {
      ...source,
      objectives: source.objectives.map((objective) =>
        objective.id === 'objective-orion-activation'
          ? { ...objective, title: secret, description: secret, classification: 'restricted' as const }
          : objective,
      ),
      risks: source.risks.map((risk) =>
        risk.projectId === 'project-orion'
          ? { ...risk, title: secret, description: secret, mitigation: secret, classification: 'restricted' as const }
          : risk,
      ),
    };

    const prepared = prepareVisualizationData(data);
    const serialized = JSON.stringify(prepared);

    expect(serialized).not.toContain(secret);
    expect(prepared.risks).toEqual([]);
    expect(prepared.alignmentProjects[0]?.hasRestrictedObjectives).toBe(true);
  });

  it('derives trends only from snapshots whose KR passed permission checks', () => {
    const source = mockRepository.getDashboardData('user-project-leader');
    const data = {
      ...source,
      keyResults: source.keyResults.map((keyResult) =>
        keyResult.id === 'kr-orion-activation'
          ? { ...keyResult, classification: 'restricted' as const }
          : keyResult,
      ),
    };

    expect(prepareVisualizationData(data).trendPoints).toEqual([]);
  });

  it('filters workloads with worklog permission before resolving member labels', () => {
    const source = mockRepository.getDashboardData('user-hr');
    const unauthorized = {
      ...source.workloads[0],
      id: 'unauthorized-workload',
      sourceReportId: 'missing-source-report',
      userId: 'user-project-leader',
      loggedHours: 999,
    };
    const prepared = prepareVisualizationData({ ...source, workloads: [unauthorized] });

    expect(prepared.workloads).toEqual([]);
    expect(JSON.stringify(prepared)).not.toContain('999');
    expect(JSON.stringify(prepared)).not.toContain('李然');
  });

  it('keeps risk meaning available without relying on color', () => {
    const prepared = prepareVisualizationData(mockRepository.getDashboardData('user-project-leader'));

    expect(prepared.risks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: '实验样本量不足', probabilityLabel: '中概率', impactLabel: '中影响' }),
      ]),
    );
  });
});
