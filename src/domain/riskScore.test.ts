import { describe, expect, it } from 'vitest';
import { getRiskCoordinate, impactDefinitions, probabilityDefinitions, scoreRisk } from './riskScore';

describe('scoreRisk', () => {
  it.each([
    [1, 1, 1, 'low'], [1, 2, 2, 'low'], [1, 3, 3, 'medium'],
    [2, 1, 2, 'low'], [2, 2, 4, 'medium'], [2, 3, 6, 'high'],
    [3, 1, 3, 'medium'], [3, 2, 6, 'high'], [3, 3, 9, 'critical'],
  ] as const)('%s × %s = %s (%s)', (probability, impact, score, level) => {
    expect(scoreRisk(probability, impact)).toEqual({ score, level });
  });

  it.each([
    [1, 1, { probability: 1, impact: 1, score: 1, level: 'low' }],
    [1, 2, { probability: 1, impact: 2, score: 2, level: 'low' }],
    [1, 3, { probability: 1, impact: 3, score: 3, level: 'medium' }],
    [2, 1, { probability: 2, impact: 1, score: 2, level: 'low' }],
    [2, 2, { probability: 2, impact: 2, score: 4, level: 'medium' }],
    [2, 3, { probability: 2, impact: 3, score: 6, level: 'high' }],
    [3, 1, { probability: 3, impact: 1, score: 3, level: 'medium' }],
    [3, 2, { probability: 3, impact: 2, score: 6, level: 'high' }],
    [3, 3, { probability: 3, impact: 3, score: 9, level: 'critical' }],
  ] as const)('returns coordinate metadata for %s × %s', (probability, impact, expected) => {
    expect(getRiskCoordinate(probability, impact)).toEqual(expected);
  });

  it('publishes the approved probability and impact definitions', () => {
    expect(probabilityDefinitions).toEqual({ 1: '不太可能（<30%）', 2: '可能（30–69%）', 3: '很可能（>=70%）' });
    expect(impactDefinitions[3]).toContain('目标、截止日期、合规或重大业务');
  });
});
