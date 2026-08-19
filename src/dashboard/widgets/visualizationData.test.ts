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
    };

    const prepared = prepareVisualizationData(data);
    const serialized = JSON.stringify(prepared);

    expect(serialized).not.toContain(secret);
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

  it('does not leak a restricted objective even when its project is readable', () => {
    const source = mockRepository.getDashboardData('user-project-leader');
    const secret = '项目可读但目标标题严格机密';
    const restrictedObjective = {
      ...source.objectives.find((objective) => objective.projectId === 'project-orion')!,
      title: secret,
      classification: 'restricted' as const,
    };

    const prepared = prepareVisualizationData({ ...source, objectives: [restrictedObjective] });

    expect(JSON.stringify(prepared)).not.toContain(secret);
  });
});
