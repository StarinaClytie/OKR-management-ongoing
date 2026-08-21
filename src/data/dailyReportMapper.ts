import type { DailyReport } from '../domain/types';
import type { DailyReportDraft } from '../domain/dailyEntry';

export function dailyReportToDraft(report: DailyReport): DailyReportDraft {
  const blocks = (report.blocks ?? []).map((block, index) => ({
    id: block.id || `block-${index + 1}`,
    dailyObjective: block.dailyObjective,
    linkedKeyResultId: block.keyResultId,
    workDescription: block.workDescription ?? block.keyResults[0]?.title ?? '',
    hours: block.hours,
    result: block.result,
    evidence: (block.evidenceItems ?? []).map((item) => ({ ...item })),
  }));

  if (blocks.length > 0 && blocks.every((block) => block.evidence.length === 0)) {
    blocks[0]!.evidence = (report.evidenceItems ?? report.evidence.map((label, index) => ({ id: `evidence-${index + 1}`, label, kind: 'link' as const, classification: report.evidenceClassification }))).map((item) => ({ ...item }));
  }

  return {
    blocks,
    classification: report.classification,
  };
}
