import { describe, expect, it } from 'vitest';
import { allowedClassifications, canEditDailyReport } from './dailyReportPolicy';

describe('daily report policy', () => {
  it('allows classifications at or below the administrator-assigned clearance', () => {
    expect(allowedClassifications('internal')).toEqual(['public', 'internal']);
    expect(allowedClassifications('restricted')).toEqual(['public', 'internal', 'confidential', 'restricted']);
  });

  it('allows an author to edit their unconfirmed report on the Shanghai business date', () => {
    expect(canEditDailyReport('owner', {
      authorId: 'owner',
      date: '2026-08-23',
      status: 'submitted',
    }, '2026-08-23')).toBe(true);
  });

  it('locks confirmed reports even on the Shanghai business date', () => {
    expect(canEditDailyReport('owner', {
      authorId: 'owner',
      date: '2026-08-23',
      status: 'confirmed',
    }, '2026-08-23')).toBe(false);
  });

  it('locks reports dated before the Shanghai business date', () => {
    expect(canEditDailyReport('owner', {
      authorId: 'owner',
      date: '2026-08-22',
      status: 'submitted',
    }, '2026-08-23')).toBe(false);
  });
});
