import { expect, it } from 'vitest';
import { dailyReportToDraft } from './dailyReportMapper';
import type { DailyReport } from '../domain/types';

it('maps a persisted block report to an editable block draft', () => {
  const report: DailyReport = {
    id: 'report-1', authorId: 'user-1', projectId: 'project-1', objectiveId: 'objective-1', keyResultIds: ['kr-1'],
    date: '2026-08-13', content: '完成采集', dailyObjective: '完成采集',
    blocks: [{
      id: 'block-1', dailyObjective: '完成实验采集第一阶段', keyResultId: 'kr-1', hours: 3.5, result: '样本已采集',
      keyResults: [{ id: 'kr-1', title: '完成样本 A 测量' }],
    }],
    classification: 'internal', hours: 3.5, evidence: ['https://example.com'], evidenceItems: [{ id: 'e-1', label: 'https://example.com', kind: 'link', classification: 'confidential' }],
    evidenceClassification: 'confidential', attachmentIds: [], status: 'draft',
  };
  expect(dailyReportToDraft(report)).toEqual(expect.objectContaining({
    blocks: [expect.objectContaining({
      dailyObjective: '完成实验采集第一阶段', linkedKeyResultId: 'kr-1', hours: 3.5, result: '样本已采集',
      keyResults: [expect.objectContaining({ title: '完成样本 A 测量' })],
    })],
    evidence: [expect.objectContaining({ classification: 'confidential' })],
  }));
});
