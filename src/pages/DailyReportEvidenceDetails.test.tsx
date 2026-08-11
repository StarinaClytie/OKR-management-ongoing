import { render, screen } from '@testing-library/react';
import { users } from '../mocks/users';
import { dailyReports } from '../mocks/reports';
import { attachments } from '../mocks/security';
import { DailyReportEvidenceDetails } from './DailyReportEvidenceDetails';

describe('DailyReportEvidenceDetails', () => {
  it('authorizes each evidence and attachment independently before adding its metadata to the DOM', () => {
    const projectLeader = users.find((user) => user.id === 'user-project-leader')!;
    const report = {
      ...dailyReports.find((item) => item.id === 'daily-report-employee-2026-08-07')!,
      evidenceItems: [
        { id: 'evidence-visible', label: '已授权的成果链接', kind: 'link' as const, classification: 'internal' as const },
        { id: 'evidence-restricted', label: '不得泄漏的受限证据标题', kind: 'file' as const, classification: 'restricted' as const },
      ],
    };
    const visibleAttachment = {
      ...attachments.find((item) => item.id === 'attachment-public-orion-brief')!,
      relatedResourceId: report.id,
      title: '允许显示的附件.pdf',
    };
    const restrictedAttachment = {
      ...attachments.find((item) => item.id === 'attachment-confidential-orion-evidence')!,
      id: 'attachment-restricted-evidence-test',
      relatedResourceId: report.id,
      title: '不得泄漏的受限附件.xlsx',
      classification: 'restricted' as const,
    };
    const { container } = render(
      <DailyReportEvidenceDetails
        viewer={projectLeader}
        report={report}
        attachments={[visibleAttachment, restrictedAttachment]}
      />,
    );

    expect(screen.getByText('已授权的成果链接')).toBeVisible();
    expect(screen.getByText('允许显示的附件.pdf')).toBeVisible();
    expect(container).not.toHaveTextContent('不得泄漏的受限证据标题');
    expect(container).not.toHaveTextContent('不得泄漏的受限附件.xlsx');
    expect(container.querySelector('[aria-label*="不得泄漏"]')).not.toBeInTheDocument();
  });
});
