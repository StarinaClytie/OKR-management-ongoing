import { describe, expect, it } from 'vitest';
import {
  getKrAverageReference,
  getKrGuidance,
  toLocalDailyReport,
  validateDailyReportDraft,
  validateProgress,
  type DailyReportConversionContext,
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

function conversionContext(overrides: Partial<DailyReportConversionContext> = {}): DailyReportConversionContext {
  return {
    authorId: 'user-employee',
    projectId: 'project-orion',
    fallbackObjectiveId: 'objective-fallback',
    date: '2026-08-11',
    objectives: [
      { id: 'objective-fallback', projectId: 'project-orion' },
      { id: 'objective-linked', projectId: 'project-orion' },
    ],
    keyResults: [{ id: 'kr-linked', objectiveId: 'objective-linked' }],
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

  it('averages only explicitly entered valid KR progress, including 0%', () => {
    expect(getKrAverageReference([
      quantityKr({ progress: undefined }),
      quantityKr({ id: 'daily-kr-2', progress: 0 }),
      quantityKr({ id: 'daily-kr-3', progress: 100 }),
      quantityKr({ id: 'daily-kr-4', progress: 101 }),
    ])).toBe(50);
  });

  it('returns no average when every KR progress is empty or invalid', () => {
    expect(getKrAverageReference([
      quantityKr({ progress: undefined }),
      quantityKr({ id: 'daily-kr-2', progress: 101 }),
    ])).toBeNull();
  });

  it.each([[-1], [101], [Number.NaN], [Number.POSITIVE_INFINITY]])(
    'rejects progress outside 0 to 100: %s',
    (value) => {
      expect(validateProgress(value)).toBe('完成度需填写 0%～100%');
    },
  );

  it('rejects missing progress separately from an out-of-range value', () => {
    expect(validateProgress(undefined)).toBe('请填写完成度');
  });

  it.each([[0], [75], [100]])('accepts employee-entered progress within 0 to 100: %s', (value) => {
    expect(validateProgress(value)).toBeNull();
  });

  it('explains a quantity KR without calculating the employee value', () => {
    expect(getKrGuidance('quantity')).toEqual(expect.objectContaining({
      formula: '实际完成值 ÷ 目标值',
      example: '目标 20 条，完成 15 条，可填写 75%',
    }));
  });

  it.each([
    [
      'ratio',
      {
        label: '比率型',
        formula: '（当前值 − 起始值）÷（目标值 − 起始值）',
        example: '从 40% 提升至 70%，当前 55%，可自行计算后填写完成度。',
        caution: '请区分“提升”与“提升至”的基准差异。',
      },
    ],
    [
      'milestone',
      {
        label: '里程碑型',
        formula: '依据截止日期与当前状态自行判断',
        example: '完成可填写 100%，未完成可填写 0%',
        caution: '过程进度由员工结合实际情况自行评估。',
      },
    ],
    [
      'subjective',
      {
        label: '主观型',
        formula: '自评分 × 100%',
        example: '自评 0.75 分时换算填写 75%',
        caution: '仅在难以量化时使用，并先写清可共同判断的验收标准。',
      },
    ],
  ] as const)('provides the complete %s KR guidance', (type, guidance) => {
    expect(getKrGuidance(type)).toEqual(guidance);
  });

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

    const result = toLocalDailyReport(draft, conversionContext());

    expect(result).toMatchObject({ ok: true, report: {
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
    } });
    expect(draft.keyResults[0]?.progress).toBe(75);
  });

  it('creates stable distinct ids for multiple local submissions on the same day', () => {
    const draft: DailyReportDraft = {
      dailyObjective: '完成数据收集',
      objectiveProgress: 60,
      keyResults: [quantityKr()],
      evidence: [],
      classification: 'internal',
    };

    const first = toLocalDailyReport(draft, conversionContext({ submissionNonce: 1 }));
    const second = toLocalDailyReport(draft, conversionContext({ submissionNonce: 2 }));

    expect(first.ok && first.report.id).toBe('local-user-employee-2026-08-11-1');
    expect(second.ok && second.report.id).toBe('local-user-employee-2026-08-11-2');
  });

  it('rejects a linked objective outside the current project', () => {
    const result = toLocalDailyReport({
      dailyObjective: '完成数据收集',
      objectiveProgress: 60,
      linkedObjectiveId: 'objective-nova',
      keyResults: [],
      evidence: [],
      classification: 'internal',
    }, conversionContext({
      objectives: [{ id: 'objective-nova', projectId: 'project-nova' }],
    }));

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'OBJECTIVE_NOT_IN_PROJECT',
        message: '所关联的 O 不属于当前项目',
      },
    });
  });

  it('rejects a linked KR that does not belong to the final objective', () => {
    const result = toLocalDailyReport({
      dailyObjective: '完成数据收集',
      objectiveProgress: 60,
      linkedObjectiveId: 'objective-linked',
      keyResults: [quantityKr({ linkedKeyResultId: 'kr-other-objective' })],
      evidence: [],
      classification: 'internal',
    }, conversionContext({
      keyResults: [{ id: 'kr-other-objective', objectiveId: 'objective-fallback' }],
    }));

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'KEY_RESULT_NOT_IN_OBJECTIVE',
        message: '所关联的 KR 不属于最终 O',
      },
    });
  });

  it('copies daily KR and evidence values so later draft edits cannot change the report', () => {
    const draft: DailyReportDraft = {
      dailyObjective: '完成数据收集',
      objectiveProgress: 60,
      linkedObjectiveId: 'objective-linked',
      keyResults: [quantityKr({ linkedKeyResultId: 'kr-linked' })],
      evidence: [{ id: 'evidence-1', label: '数据表链接', kind: 'link', classification: 'internal' }],
      classification: 'internal',
    };
    const result = toLocalDailyReport(draft, conversionContext());

    if (!result.ok) throw new Error(result.error.message);
    draft.keyResults[0]!.progress = 10;
    draft.evidence[0]!.label = '已替换的链接';
    draft.evidence.push({ id: 'evidence-2', label: '新附件', kind: 'file', classification: 'confidential' });

    expect(result.report.dailyKeyResults).toEqual([expect.objectContaining({ progress: 75 })]);
    expect(result.report.evidence).toEqual(['数据表链接']);
  });

  it('fails closed for missing structured O, KR, work note, finite hours, type fields, and evidence metadata', () => {
    const invalidDraft: DailyReportDraft = {
      dailyObjective: ' ',
      objectiveProgress: 60,
      keyResults: [
        quantityKr({
          title: ' ',
          workNote: ' ',
          hours: Number.NaN,
          targetValue: undefined,
          actualValue: Number.NEGATIVE_INFINITY,
        }),
        {
          id: 'daily-kr-2',
          title: '里程碑',
          type: 'milestone',
          hours: -0.5,
          progress: 60,
          workNote: '已跟进',
          dueDate: '',
          milestoneStatus: undefined,
        },
      ],
      evidence: [{ id: 'evidence-1', label: ' ', kind: 'link', classification: 'internal' }],
      classification: 'internal',
    };

    expect(validateDailyReportDraft(invalidDraft)).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'dailyObjective', message: '请填写当日 O' }),
      expect.objectContaining({ field: 'keyResults.0.title', message: '请填写 KR 内容' }),
      expect.objectContaining({ field: 'keyResults.0.workNote', message: '请填写 KR 工作说明' }),
      expect.objectContaining({ field: 'keyResults.0.hours', message: '工时需填写有限且不小于 0 的数值' }),
      expect.objectContaining({ field: 'keyResults.0.targetValue', message: '请填写数量型 KR 的目标值' }),
      expect.objectContaining({ field: 'keyResults.0.actualValue', message: '当前实际值需填写有限且不小于 0 的数值' }),
      expect.objectContaining({ field: 'keyResults.1.hours', message: '工时需填写有限且不小于 0 的数值' }),
      expect.objectContaining({ field: 'keyResults.1.dueDate', message: '请填写里程碑截止日期' }),
      expect.objectContaining({ field: 'keyResults.1.milestoneStatus', message: '请选择里程碑当前状态' }),
      expect.objectContaining({ field: 'evidence.0.label', message: '请填写成果名称或链接说明' }),
    ]));
    expect(toLocalDailyReport(invalidDraft, conversionContext())).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'INVALID_DRAFT' }),
    });
  });

  it('preserves an immutable typed record for every submitted evidence item', () => {
    const draft: DailyReportDraft = {
      dailyObjective: '完成数据收集',
      objectiveProgress: 60,
      keyResults: [quantityKr()],
      evidence: [
        { id: 'evidence-link', label: '数据表链接', kind: 'link', classification: 'internal' },
        { id: 'evidence-file', label: '访谈记录.xlsx', kind: 'file', classification: 'confidential' },
      ],
      classification: 'internal',
    };
    const result = toLocalDailyReport(draft, conversionContext());

    if (!result.ok) throw new Error(result.error.message);
    draft.evidence[0]!.label = '被篡改的标题';

    expect(result.report.evidenceItems).toEqual([
      { id: 'evidence-link', label: '数据表链接', kind: 'link', classification: 'internal' },
      { id: 'evidence-file', label: '访谈记录.xlsx', kind: 'file', classification: 'confidential' },
    ]);
  });
});
