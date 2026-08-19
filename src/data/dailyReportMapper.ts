import type { DailyReport } from '../domain/types';
import type { DailyReportDraft } from '../domain/dailyEntry';

export function dailyReportToDraft(report: DailyReport): DailyReportDraft {
  const blocks = (report.blocks ?? []).map((block, index) => ({
    id: block.id || `block-${index + 1}`,
    dailyObjective: block.dailyObjective,
    linkedKeyResultId: block.keyResultId,
    hours: block.hours,
    result: block.result,
    keyResults: block.keyResults.map((keyResult, krIndex) => ({ ...keyResult, id: keyResult.id || `daily-kr-${krIndex + 1}` })),
  }));

  return {
    blocks,
    evidence: (report.evidenceItems ?? report.evidence.map((label, index) => ({ id: `evidence-${index + 1}`, label, kind: 'link' as const, classification: report.evidenceClassification }))).map((item) => ({ ...item })),
    classification: report.classification,
  };
}
