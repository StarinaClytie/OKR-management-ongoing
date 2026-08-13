export interface ProgressPlanPoint { date: string; value: number }
export interface ProgressPlanKr {
  startDate: string;
  dueDate: string;
  measurementType: 'percentage' | 'number' | 'currency' | 'boolean';
  targetValue: number;
}
export interface ProgressPlanError {
  code: 'outside_period' | 'duplicate_date' | 'decreasing_value' | 'outside_range' | 'missing_due_date' | 'wrong_target';
  index?: number;
}

export function validateProgressPlan(points: readonly ProgressPlanPoint[], kr: ProgressPlanKr): ProgressPlanError[] {
  const errors: ProgressPlanError[] = [];
  const dates = new Set<string>();
  let previousValue: number | undefined;
  points.forEach((point, index) => {
    if (point.date < kr.startDate || point.date > kr.dueDate) errors.push({ code: 'outside_period', index });
    if (dates.has(point.date)) errors.push({ code: 'duplicate_date', index });
    dates.add(point.date);
    if (kr.measurementType !== 'boolean' && previousValue !== undefined && point.value < previousValue) errors.push({ code: 'decreasing_value', index });
    if (kr.measurementType === 'percentage' && (point.value < 0 || point.value > 100)) errors.push({ code: 'outside_range', index });
    previousValue = point.value;
  });
  const final = points.find((point) => point.date === kr.dueDate);
  if (!final) errors.push({ code: 'missing_due_date' });
  else if (final.value !== kr.targetValue) errors.push({ code: 'wrong_target', index: points.indexOf(final) });
  return errors;
}

function utcDay(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / 86_400_000;
}

export function plannedProgressAt(points: readonly ProgressPlanPoint[], date: string): number {
  const sorted = [...points].sort((left, right) => left.date.localeCompare(right.date));
  if (sorted.length === 0) return 0;
  if (date <= sorted[0]!.date) return sorted[0]!.value;
  if (date >= sorted.at(-1)!.date) return sorted.at(-1)!.value;
  for (let index = 1; index < sorted.length; index += 1) {
    const right = sorted[index]!;
    const left = sorted[index - 1]!;
    if (date <= right.date) {
      const ratio = (utcDay(date) - utcDay(left.date)) / (utcDay(right.date) - utcDay(left.date));
      return Number((left.value + (right.value - left.value) * ratio).toFixed(2));
    }
  }
  return sorted.at(-1)!.value;
}
