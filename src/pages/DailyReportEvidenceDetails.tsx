import { can } from '../auth/permissionService';
import { getAttachmentPermissionScope, getDailyEvidencePermissionScope } from '../domain/permissions';
import type { DailyEvidenceDraft } from '../domain/dailyEntry';
import type { DailyReport, DocumentRecord, User } from '../domain/types';

interface Props { viewer: User; report: DailyReport; attachments: readonly DocumentRecord[]; }
export function DailyReportEvidenceDetails({ viewer, report, attachments }: Props) {
  const evidence: DailyEvidenceDraft[] = report.evidenceItems ?? report.evidence.map((label, index) => ({ id: `legacy-${index + 1}`, label, kind: 'link', classification: report.evidenceClassification }));
  const visibleEvidence = evidence.filter((item) => can(viewer, 'evidence.read', getDailyEvidencePermissionScope(report, item)).allowed);
  const visibleAttachments = attachments.filter((item) => item.relatedResourceId === report.id && can(viewer, 'attachment.read', getAttachmentPermissionScope(item)).allowed);
  if (visibleEvidence.length === 0 && visibleAttachments.length === 0) return null;
  return <ul aria-label="可查看的成果与附件" className="daily-report-evidence-details">{visibleEvidence.map((item) => <li key={item.id}>{item.label}</li>)}{visibleAttachments.map((item) => <li key={item.id}>{item.title}</li>)}</ul>;
}
