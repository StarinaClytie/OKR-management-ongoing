import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { DailyEvidenceDraft } from '../../domain/dailyEntry';
import { DailyReportEvidence } from './DailyReportEvidence';

function applyEvidenceUpdate(update: DailyEvidenceDraft[] | ((current: DailyEvidenceDraft[]) => DailyEvidenceDraft[]), current: DailyEvidenceDraft[]) {
  return typeof update === 'function' ? update(current) : update;
}

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
    const update = onEvidenceChange.mock.calls[0]![0];
    expect(applyEvidenceUpdate(update, [])).toEqual([expect.objectContaining({ file, label: 'proof.pdf', kind: 'file', classification: 'internal', uploadState: 'selected' })]);
  });

  it('invokes immediate upload for each valid selected file without waiting for submit', async () => {
    const user = userEvent.setup();
    const onUploadRequested = vi.fn();
    render(<DailyReportEvidence evidence={[]} onEvidenceChange={vi.fn()} onUploadRequested={onUploadRequested} clearance="internal" />);
    const file = new File(['proof'], 'proof.pdf', { type: 'application/pdf' });

    await user.upload(screen.getByLabelText('选择成果附件'), file);

    expect(onUploadRequested).toHaveBeenCalledOnce();
    expect(onUploadRequested).toHaveBeenCalledWith(expect.objectContaining({ file, uploadState: 'selected' }));
  });

  it('shows only classifications allowed by the current user clearance', () => {
    render(<DailyReportEvidence evidence={[{ id: 'one', label: 'proof.pdf', kind: 'file', classification: 'internal' }]} onEvidenceChange={vi.fn()} clearance="internal" />);
    expect(screen.getByRole('option', { name: '公开' })).toBeVisible();
    expect(screen.getByRole('option', { name: '内部' })).toBeVisible();
    expect(screen.queryByRole('option', { name: '机密' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '绝密' })).not.toBeInTheDocument();
  });

  it('renders persisted over-clearance classification read-only until authorized removal', () => {
    render(<DailyReportEvidence evidence={[{ id: 'one', attachmentId: 'attachment-1', label: 'proof.pdf', kind: 'file', classification: 'confidential', uploadState: 'uploaded' }]} onEvidenceChange={vi.fn()} onRemoveAttachment={vi.fn()} clearance="internal" />);
    expect(screen.queryByRole('combobox', { name: '成果 1 密级' })).not.toBeInTheDocument();
    expect(screen.getAllByText('机密')).not.toHaveLength(0);
    expect(screen.getByRole('button', { name: '移除 proof.pdf' })).toBeVisible();
  });

  it('authorizes persisted evidence download and removal before updating the draft', async () => {
    const user = userEvent.setup();
    const item = { id: 'one', attachmentId: 'attachment-1', label: 'proof.pdf', kind: 'file' as const, classification: 'internal' as const, uploadState: 'uploaded' as const };
    const onEvidenceChange = vi.fn();
    const onDownloadAttachment = vi.fn().mockResolvedValue(undefined);
    const onRemoveAttachment = vi.fn().mockResolvedValue(true);
    render(<DailyReportEvidence evidence={[item]} onEvidenceChange={onEvidenceChange} onDownloadAttachment={onDownloadAttachment} onRemoveAttachment={onRemoveAttachment} />);

    await user.click(screen.getByRole('button', { name: '下载 proof.pdf' }));
    expect(onDownloadAttachment).toHaveBeenCalledWith('attachment-1');

    await user.click(screen.getByRole('button', { name: '移除 proof.pdf' }));
    expect(onRemoveAttachment).toHaveBeenCalledWith('attachment-1');
    const update = onEvidenceChange.mock.calls[0]![0];
    expect(applyEvidenceUpdate(update, [item])).toEqual([]);
  });

  it('keeps persisted evidence in the draft when authorized removal fails', async () => {
    const user = userEvent.setup();
    const item = { id: 'one', attachmentId: 'attachment-1', label: 'proof.pdf', kind: 'file' as const, classification: 'internal' as const, uploadState: 'uploaded' as const };
    const onEvidenceChange = vi.fn();
    render(<DailyReportEvidence evidence={[item]} onEvidenceChange={onEvidenceChange} onRemoveAttachment={vi.fn().mockResolvedValue(false)} />);

    await user.click(screen.getByRole('button', { name: '移除 proof.pdf' }));
    expect(onEvidenceChange).not.toHaveBeenCalled();
  });

  it('awaits item-scoped cleanup before removing immediate-upload evidence', async () => {
    const user = userEvent.setup();
    const item = { id: 'one', attachmentId: 'attachment-1', label: 'proof.pdf', kind: 'file' as const, classification: 'internal' as const, uploadState: 'uploading' as const, uploadProgress: 50 };
    let resolveCleanup!: (removed: boolean) => void;
    const onRemoveEvidence = vi.fn(() => new Promise<boolean>((resolve) => { resolveCleanup = resolve; }));
    const onEvidenceChange = vi.fn();
    render(<DailyReportEvidence evidence={[item]} onEvidenceChange={onEvidenceChange} onRemoveEvidence={onRemoveEvidence} />);

    await user.click(screen.getByRole('button', { name: '移除 proof.pdf' }));
    expect(onRemoveEvidence).toHaveBeenCalledWith(item);
    expect(onEvidenceChange).not.toHaveBeenCalled();
    resolveCleanup(true);
    await waitFor(() => expect(onEvidenceChange).toHaveBeenCalledOnce());
  });

  it('applies concurrent authorized removals to the latest evidence state', async () => {
    const user = userEvent.setup();
    const resolvers = new Map<string, (removed: boolean) => void>();
    const onRemoveAttachment = vi.fn((attachmentId: string) => new Promise<boolean>((resolve) => resolvers.set(attachmentId, resolve)));
    const initial: DailyEvidenceDraft[] = [
      { id: 'one', attachmentId: 'attachment-1', label: 'one.pdf', kind: 'file', classification: 'internal', uploadState: 'uploaded' },
      { id: 'two', attachmentId: 'attachment-2', label: 'two.pdf', kind: 'file', classification: 'internal', uploadState: 'uploaded' },
      { id: 'three', attachmentId: 'attachment-3', label: 'three.pdf', kind: 'file', classification: 'internal', uploadState: 'uploaded' },
    ];
    function Harness() {
      const [evidence, setEvidence] = useState(initial);
      return <DailyReportEvidence evidence={evidence} onEvidenceChange={setEvidence} onRemoveAttachment={onRemoveAttachment} />;
    }
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '移除 one.pdf' }));
    await user.click(screen.getByRole('button', { name: '移除 two.pdf' }));
    await user.upload(screen.getByLabelText('选择成果附件'), new File(['added'], 'added.pdf', { type: 'application/pdf' }));
    resolvers.get('attachment-1')?.(true);
    await waitFor(() => expect(screen.queryByDisplayValue('one.pdf')).not.toBeInTheDocument());

    await user.clear(screen.getByDisplayValue('three.pdf'));
    await user.type(screen.getByRole('textbox', { name: '成果 2' }), 'three-edited.pdf');
    resolvers.get('attachment-2')?.(true);

    await waitFor(() => {
      expect(screen.queryByDisplayValue('two.pdf')).not.toBeInTheDocument();
      expect(screen.getByDisplayValue('three-edited.pdf')).toBeVisible();
      expect(screen.getByDisplayValue('added.pdf')).toBeVisible();
    });
  });
});
