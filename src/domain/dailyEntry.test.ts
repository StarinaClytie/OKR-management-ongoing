import { describe, expect, it } from 'vitest';
import {
  toLocalDailyReport,
  validateDailyReportDraft,
  type DailyReportConversionContext,
  type DailyOkrBlockDraft,
  type DailyReportDraft,
} from './dailyEntry';

function block(overrides: Partial<DailyOkrBlockDraft> = {}): DailyOkrBlockDraft {
  return {
    id: 'block-1',
    dailyObjective: '完成实验数据采集第一阶段',
    linkedKeyResultId: 'kr-linked',
    workDescription: '执行实验与数据整理',
    hours: 3.5,
    result: '采集到样本数据',
    evidence: [],
    ...overrides,
  };
}

function conversionContext(overrides: Partial<DailyReportConversionContext> = {}): DailyReportConversionContext {
  return {
    authorId: 'user-employee',
    date: '2026-08-19',
    keyResults: [{ id: 'kr-linked', objectiveId: 'objective-1' }],
    objectives: [{ id: 'objective-1', projectId: 'project-1' }],
    ...overrides,
  };
}

function draft(overrides: Partial<DailyReportDraft> = {}): DailyReportDraft {
  return {
    blocks: [block()],
    classification: 'internal',
    ...overrides,
  };
}

describe('daily OKR block validation', () => {
  it('requires a Daily O, a linked quarterly KR, and finite non-negative hours per block', () => {
    const issues = validateDailyReportDraft(draft({
      blocks: [block({ dailyObjective: ' ', linkedKeyResultId: '', hours: Number.NaN })],
    }));

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'blocks.0.dailyObjective', message: '请填写当日 O' }),
      expect.objectContaining({ field: 'blocks.0.linkedKeyResultId', message: '请选择关联的季度 KR' }),
      expect.objectContaining({ field: 'blocks.0.hours', message: '工时需填写有限且不小于 0 的数值' }),
    ]));
  });

  it('requires a work description and result in every entry', () => {
    const issues = validateDailyReportDraft(draft({
      blocks: [block({ workDescription: ' ', result: ' ' })],
    }));

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'blocks.0.workDescription' }),
      expect.objectContaining({ field: 'blocks.0.result' }),
    ]));
  });

  it('requires at least one Daily OKR block', () => {
    expect(validateDailyReportDraft(draft({ blocks: [] }))).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'blocks', message: '请至少添加一组 Daily OKR' }),
    ]));
  });

  it('rejects link evidence in newly authored Daily OKR blocks', () => {
    const issues = validateDailyReportDraft(draft({
      blocks: [block({ evidence: [{
        id: 'legacy-link', label: '设计文档', kind: 'link', classification: 'internal',
      }] })],
    }));

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'blocks.0.evidence.0.kind', message: '仅支持上传文件作为成果附件' }),
    ]));
  });

  it('keeps legacy link evidence valid when explicitly preserving an existing draft', () => {
    const issues = validateDailyReportDraft(draft({
      blocks: [block({ evidence: [{
        id: 'legacy-link', label: '设计文档', kind: 'link', classification: 'internal',
      }] })],
    }), { allowLegacyLinkEvidence: true });

    expect(issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'blocks.0.evidence.0.kind' }),
    ]));
  });

  it('orders issues in the same order as the Daily OKR controls', () => {
    const issues = validateDailyReportDraft(draft({
      blocks: [block({ hours: -1, workDescription: ' ', result: ' ' })],
    }));

    expect(issues.map((issue) => issue.field)).toEqual([
      'blocks.0.workDescription',
      'blocks.0.result',
      'blocks.0.hours',
    ]);
  });
});

describe('daily OKR block conversion', () => {
  it('sums block hours into the daily total and preserves the authored O and KR', () => {
    const result = toLocalDailyReport(draft({
      blocks: [
        block({ hours: 3.5 }),
        block({ id: 'block-2', hours: 2.5, dailyObjective: '完成数据整理', linkedKeyResultId: 'kr-linked' }),
      ],
    }), conversionContext());

    expect(result).toMatchObject({ ok: true, report: {
      id: 'local-user-employee-2026-08-19',
      objectiveId: 'objective-1',
      projectId: 'project-1',
      dailyObjective: '完成实验数据采集第一阶段',
      hours: 6,
      keyResultIds: ['kr-linked', 'kr-linked'],
      blocks: [
        expect.objectContaining({ dailyObjective: '完成实验数据采集第一阶段', hours: 3.5 }),
        expect.objectContaining({ dailyObjective: '完成数据整理', hours: 2.5 }),
      ],
      status: 'submitted',
    } });
  });

  it('creates stable distinct ids for multiple local submissions on the same day', () => {
    const first = toLocalDailyReport(draft(), conversionContext({ submissionNonce: 1 }));
    const second = toLocalDailyReport(draft(), conversionContext({ submissionNonce: 2 }));

    expect(first.ok && first.report.id).toBe('local-user-employee-2026-08-19-1');
    expect(second.ok && second.report.id).toBe('local-user-employee-2026-08-19-2');
  });

  it('rejects a block linked to a KR the context does not resolve', () => {
    const result = toLocalDailyReport(draft({ blocks: [block({ linkedKeyResultId: 'kr-unknown' })] }), conversionContext());

    expect(result).toEqual({
      ok: false,
      error: { code: 'KEY_RESULT_NOT_AVAILABLE', message: '所关联的季度 KR 不可用' },
    });
  });

  it('copies block values so later draft edits cannot change the report', () => {
    const result = toLocalDailyReport(draft(), conversionContext());
    if (!result.ok) throw new Error(result.error.message);

    (draft as unknown as { blocks: DailyOkrBlockDraft[] }).blocks = [];

    expect(result.report.blocks).toHaveLength(1);
    expect(result.report.blocks![0]!.dailyObjective).toBe('完成实验数据采集第一阶段');
  });

  it('fails closed for an invalid draft', () => {
    const result = toLocalDailyReport(draft({ blocks: [block({ dailyObjective: ' ' })] }), conversionContext());
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_DRAFT' }) });
  });
});
