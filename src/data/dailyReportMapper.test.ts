import { expect, it } from 'vitest';
import { dailyReportToDraft } from './dailyReportMapper';
import type { DailyReport } from '../domain/types';

it('maps a persisted report to an editable draft preserving zero and typed measurement fields', () => {
  const report: DailyReport = {
    id: 'report-1', authorId: 'user-1', projectId: 'project-1', objectiveId: 'objective-1', keyResultIds: [],
    date: '2026-08-13', content: '目标', dailyObjective: '目标', objectiveProgress: 0,
    dailyKeyResults: [{ id: 'kr-1', title: '数量结果', type: 'quantity', progress: 0, hours: 0, workNote: '开始', targetValue: 10, actualValue: 0 }],
    classification: 'internal', hours: 0, evidence: ['https://example.com'], evidenceItems: [{ id: 'e-1', label: 'https://example.com', kind: 'link', classification: 'confidential' }],
    evidenceClassification: 'confidential', attachmentIds: [], status: 'draft',
  };
  expect(dailyReportToDraft(report)).toEqual(expect.objectContaining({
    dailyObjective: '目标', objectiveProgress: 0, linkedObjectiveId: 'objective-1',
    keyResults: [expect.objectContaining({ progress: 0, hours: 0, targetValue: 10, actualValue: 0 })],
    evidence: [expect.objectContaining({ classification: 'confidential' })],
  }));
});
