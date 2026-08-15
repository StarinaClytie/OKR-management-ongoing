import type { DailyReport } from '../domain/types';
import type { DailyReportDraft } from '../domain/dailyEntry';

export function dailyReportToDraft(report: DailyReport): DailyReportDraft {
  return {
    dailyObjective: report.dailyObjective ?? report.content,
    objectiveProgress: report.objectiveProgress,
    linkedObjectiveId: report.objectiveId,
    keyResults: (report.dailyKeyResults ?? []).map((item) => ({ ...item })),
    evidence: (report.evidenceItems ?? report.evidence.map((label, index) => ({ id: `evidence-${index + 1}`, label, kind: 'link' as const, classification: report.evidenceClassification }))).map((item) => ({ ...item })),
    classification: report.classification,
  };
}
