import { describe, expect, it } from 'vitest';
import {
  getKrAverageReference,
  getKrGuidance,
  toLocalDailyReport,
  validateProgress,
  type DailyKeyResultDraft,
  type DailyReportDraft,
} from './dailyEntry';

function quantityKr(overrides: Partial<DailyKeyResultDraft> = {}): DailyKeyResultDraft {
  return {
    id: 'daily-kr-1',
    title: '收集数据',
    type: 'quantity',
    hours: 3.5,
    progress: 75,
    workNote: '已完成 15 条数据收集',
    targetValue: 20,
    actualValue: 15,
    ...overrides,
  };
}

describe('daily entry helpers', () => {
  it('keeps progress employee-entered and only calculates a reference average', () => {
    const krs = [quantityKr({ progress: 75 }), quantityKr({ id: 'daily-kr-2', progress: 25 })];

    expect(getKrAverageReference(krs)).toBe(50);
    expect(krs.map((kr) => kr.progress)).toEqual([75, 25]);
  });

  it('returns no KR average reference when the employee has not added a KR', () => {
    expect(getKrAverageReference([])).toBeNull();
  });

  it.each([[-1], [101], [Number.NaN], [Number.POSITIVE_INFINITY]])(
    'rejects progress outside 0 to 100: %s',
    (value) => {
      expect(validateProgress(value)).toBe('完成度需填写 0%～100%');
    },
  );

  it.each([[0], [75], [100]])('accepts employee-entered progress within 0 to 100: %s', (value) => {
    expect(validateProgress(value)).toBeNull();
  });

  it('explains a quantity KR without calculating the employee value', () => {
    expect(getKrGuidance('quantity')).toEqual(expect.objectContaining({
      formula: '实际完成值 ÷ 目标值',
      example: '目标 20 条，完成 15 条，可填写 75%',
    }));
  });

  it.each(['ratio', 'milestone', 'subjective'] as const)(
    'provides concise formula, example, and caution for a %s KR',
    (type) => {
      const guidance = getKrGuidance(type);

      expect(guidance.label).not.toBe('');
      expect(guidance.formula).not.toBe('');
      expect(guidance.example).not.toBe('');
      expect(guidance.caution).not.toBe('');
    },
  );

  it('creates a submitted local report while preserving the employee-entered O and KR progress', () => {
    const draft: DailyReportDraft = {
      dailyObjective: '完成数据收集，为评审提供依据',
      objectiveProgress: 60,
      linkedObjectiveId: 'objective-linked',
      keyResults: [quantityKr({ linkedKeyResultId: 'kr-linked' })],
      evidence: [
        { id: 'evidence-1', label: '数据表链接', kind: 'link', classification: 'internal' },
        { id: 'evidence-2', label: '访谈记录', kind: 'file', classification: 'confidential' },
      ],
      classification: 'internal',
    };

    const report = toLocalDailyReport(draft, {
      authorId: 'user-employee',
      projectId: 'project-orion',
      fallbackObjectiveId: 'objective-fallback',
      date: '2026-08-11',
    });

    expect(report).toMatchObject({
      id: 'local-user-employee-2026-08-11',
      objectiveId: 'objective-linked',
      content: '完成数据收集，为评审提供依据',
      dailyObjective: '完成数据收集，为评审提供依据',
      objectiveProgress: 60,
      dailyKeyResults: [expect.objectContaining({ progress: 75 })],
      keyResultIds: ['kr-linked'],
      hours: 3.5,
      evidence: ['数据表链接', '访谈记录'],
      evidenceClassification: 'confidential',
      status: 'submitted',
    });
    expect(draft.keyResults[0]?.progress).toBe(75);
  });
});
