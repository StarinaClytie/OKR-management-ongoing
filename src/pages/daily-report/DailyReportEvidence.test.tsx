import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DailyReportEvidence } from './DailyReportEvidence';

describe('DailyReportEvidence', () => {
  it('connects file name and classification errors to their controls', () => {
    render(<DailyReportEvidence evidence={[{ id: 'one', label: '', kind: 'file', classification: 'invalid' as 'internal' }]} onEvidenceChange={vi.fn()} errors={{ 'evidence.0.label': '请填写成果名称或链接说明', 'evidence.0.classification': '请选择有效的成果密级' }} />);

    for (const field of [screen.getByRole('textbox'), screen.getByRole('combobox')]) {
      expect(field).toHaveAttribute('aria-invalid', 'true');
      const describedBy = field.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy!)).toHaveAttribute('role', 'alert');
    }
    expect(new Set(screen.getAllByRole('alert').map((alert) => alert.id)).size).toBe(2);
  });

  it('uses the native picker and returns independently classified real File objects', async () => {
    const user = userEvent.setup(); const onEvidenceChange = vi.fn();
    render(<DailyReportEvidence evidence={[]} onEvidenceChange={onEvidenceChange} />);
    const file = new File(['proof'], 'proof.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('选择成果附件'), file);
    expect(onEvidenceChange).toHaveBeenCalledWith([expect.objectContaining({ file, label: 'proof.pdf', kind: 'file', classification: 'internal', uploadState: 'selected' })]);
  });

  it('authorizes persisted evidence download and removal before updating the draft', async () => {
    const user = userEvent.setup();
    const item = { id: 'one', attachmentId: 'attachment-1', label: 'proof.pdf', kind: 'file' as const, classification: 'internal' as const, uploadState: 'uploaded' as const };
    const onEvidenceChange = vi.fn();
    const onDownloadAttachment = vi.fn().mockResolvedValue(undefined);
    const onRemoveAttachment = vi.fn().mockResolvedValue(true);
    render(<DailyReportEvidence evidence={[item]} onEvidenceChange={onEvidenceChange} onDownloadAttachment={onDownloadAttachment} onRemoveAttachment={onRemoveAttachment} />);

    await user.click(screen.getByRole('button', { name: '下载' }));
    expect(onDownloadAttachment).toHaveBeenCalledWith('attachment-1');

    await user.click(screen.getByRole('button', { name: '移除' }));
    expect(onRemoveAttachment).toHaveBeenCalledWith('attachment-1');
    expect(onEvidenceChange).toHaveBeenCalledWith([]);
  });

  it('keeps persisted evidence in the draft when authorized removal fails', async () => {
    const user = userEvent.setup();
    const item = { id: 'one', attachmentId: 'attachment-1', label: 'proof.pdf', kind: 'file' as const, classification: 'internal' as const, uploadState: 'uploaded' as const };
    const onEvidenceChange = vi.fn();
    render(<DailyReportEvidence evidence={[item]} onEvidenceChange={onEvidenceChange} onRemoveAttachment={vi.fn().mockResolvedValue(false)} />);

    await user.click(screen.getByRole('button', { name: '移除' }));
    expect(onEvidenceChange).not.toHaveBeenCalled();
  });
});
