export const probabilityDefinitions = {
  1: '不太可能（<30%）',
  2: '可能（30–69%）',
  3: '很可能（>=70%）',
} as const;

export const impactDefinitions = {
  1: '低影响（局部且可恢复）',
  2: '中影响（影响里程碑或跨团队协作）',
  3: '高影响（影响目标、截止日期、合规或重大业务）',
} as const;

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export function scoreRisk(probability: 1 | 2 | 3, impact: 1 | 2 | 3): {
  score: 1 | 2 | 3 | 4 | 6 | 9;
  level: RiskLevel;
} {
  const score = (probability * impact) as 1 | 2 | 3 | 4 | 6 | 9;
  const level: RiskLevel = score <= 2 ? 'low' : score <= 4 ? 'medium' : score === 6 ? 'high' : 'critical';
  return { score, level };
}
