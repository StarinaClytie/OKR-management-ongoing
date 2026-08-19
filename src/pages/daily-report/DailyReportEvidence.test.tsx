import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DailyReportEvidence } from './DailyReportEvidence';

describe('DailyReportEvidence', () => {
  it('connects every evidence validation error to its field with a unique visible alert', () => {
    render(<DailyReportEvidence objectives={[]} evidence={[{ id: 'one', label: '', kind: 'invalid' as 'link', classification: 'invalid' as 'internal' }]} onLinkedObjectiveChange={vi.fn()} onEvidenceChange={vi.fn()} errors={{ 'evidence.0.label': '请填写成果名称或链接说明', 'evidence.0.kind': '请选择成果类型', 'evidence.0.classification': '请选择有效的成果密级' }} />);

    for (const field of [screen.getByRole('textbox'), screen.getAllByRole('combobox')[0]!, screen.getAllByRole('combobox')[1]!]) {
      expect(field).toHaveAttribute('aria-invalid', 'true');
      const describedBy = field.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy!)).toHaveAttribute('role', 'alert');
    }
    expect(new Set(screen.getAllByRole('alert').map((alert) => alert.id)).size).toBe(3);
  });

  it('shows the required label error after an empty evidence item is submitted by the form contract', () => {
    const onEvidenceChange = vi.fn();
    render(<DailyReportEvidence objectives={[]} evidence={[]} onLinkedObjectiveChange={vi.fn()} onEvidenceChange={onEvidenceChange} />);
    fireEvent.click(screen.getByRole('button', { name: '添加成果附件或链接' }));
    expect(onEvidenceChange).toHaveBeenCalledWith([expect.objectContaining({ label: '' })]);
  });

  it('uses the native picker and returns independently classified real File objects', async () => {
    const user = userEvent.setup(); const onEvidenceChange = vi.fn();
    render(<DailyReportEvidence objectives={[]} evidence={[]} onLinkedObjectiveChange={vi.fn()} onEvidenceChange={onEvidenceChange} />);
    const file = new File(['proof'], 'proof.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('选择成果附件'), file);
    expect(onEvidenceChange).toHaveBeenCalledWith([expect.objectContaining({ file, label: 'proof.pdf', kind: 'file', classification: 'internal', uploadState: 'selected' })]);
  });
});
