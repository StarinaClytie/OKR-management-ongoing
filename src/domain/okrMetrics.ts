import type { KeyResult, KrMetricType } from './types';

export const krMetricTypes: readonly KrMetricType[] = ['numeric', 'percentage', 'milestone'];

/**
 * Derive KR progress from its metric configuration where the metric is a simple
 * value/current → target. Returns null when the metric cannot be derived (e.g.
 * milestone, missing values, or a non-positive target), so callers fall back to
 * the manually entered progress.
 */
export function deriveKeyResultProgress(keyResult: Pick<KeyResult, 'metricType' | 'currentValue' | 'targetValue' | 'progress'>): number | null {
  if (keyResult.metricType !== 'numeric' && keyResult.metricType !== 'percentage') return null;
  if (keyResult.currentValue === undefined || keyResult.targetValue === undefined) return null;
  if (keyResult.targetValue <= 0) return null;
  const ratio = keyResult.currentValue / keyResult.targetValue;
  if (!Number.isFinite(ratio)) return null;
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

/**
 * Arithmetic mean of active (non-completed) KR progress, used as the Objective's
 * overall progress. Isolated so a weighted scheme can replace it later without
 * touching callers. Completed KRs are included in the mean at their 100%.
 */
export function deriveObjectiveProgress(keyResults: ReadonlyArray<Pick<KeyResult, 'progress'>>): number {
  if (keyResults.length === 0) return 0;
  const total = keyResults.reduce((sum, keyResult) => sum + keyResult.progress, 0);
  return Math.round(total / keyResults.length);
}

export function describeKeyResultMetric(keyResult: Pick<KeyResult, 'metricType' | 'currentValue' | 'targetValue' | 'unit'>): string {
  if (keyResult.metricType === 'milestone') return '';
  const current = keyResult.currentValue === undefined ? '—' : String(keyResult.currentValue);
  const target = keyResult.targetValue === undefined ? '—' : String(keyResult.targetValue);
  const unit = keyResult.unit ? ` ${keyResult.unit}` : '';
  return `${current} / ${target}${unit}`;
}
