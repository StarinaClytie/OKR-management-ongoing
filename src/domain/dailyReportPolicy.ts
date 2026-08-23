import type { Classification, DailyReport } from './types';

export const classificationOrder = ['public', 'internal', 'confidential', 'restricted'] as const;

export function allowedClassifications(clearance: Classification): readonly Classification[] {
  return classificationOrder.slice(0, classificationOrder.indexOf(clearance) + 1);
}

export function canEditDailyReport(
  userId: string,
  report: Pick<DailyReport, 'authorId' | 'date' | 'status'>,
  businessDate: string,
): boolean {
  return report.authorId === userId && report.date === businessDate && report.status !== 'confirmed';
}
