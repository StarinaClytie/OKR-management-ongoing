import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { KeyResult } from '../domain/types';
import { KrProgressEditor } from './KrProgressEditor';

const keyResults: KeyResult[] = [
  {
    id: 'kr-owned', objectiveId: 'objective-1', title: '我负责的 KR', ownerId: 'employee-1', progress: 25,
    status: 'on_track', startDate: '2026-08-01', dueDate: '2026-09-01', classification: 'internal',
  },
  {
    id: 'kr-unowned', objectiveId: 'objective-1', title: '他人负责的 KR', ownerId: 'employee-2', progress: 50,
    status: 'on_track', startDate: '2026-08-01', dueDate: '2026-09-01', classification: 'internal',
  },
];

async function completeForm(progress: string, onSave = vi.fn().mockResolvedValue({ ok: true, data: { snapshotId: 'snapshot-1' } })) {
  const user = userEvent.setup();
  render(<KrProgressEditor ownerId="employee-1" keyResults={keyResults} onSave={onSave} />);
  await user.clear(screen.getByLabelText('实际进度（0–100）'));
  await user.type(screen.getByLabelText('实际进度（0–100）'), progress);
  await user.type(screen.getByLabelText('生效日期'), '2026-08-14');
  await user.type(screen.getByLabelText('更新说明'), '完成边界值验证');
  await user.click(screen.getByRole('button', { name: '保存 KR 进度' }));
  return { user, onSave };
}

describe('KrProgressEditor', () => {
  it('offers only KRs owned by the signed-in employee', () => {
    render(<KrProgressEditor ownerId="employee-1" keyResults={keyResults} onSave={vi.fn()} />);

    expect(screen.getByRole('option', { name: '我负责的 KR' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '他人负责的 KR' })).not.toBeInTheDocument();
  });

  it.each(['0', '100'])('accepts the valid progress boundary %s', async (progress) => {
    const { onSave } = await completeForm(progress);

    expect(onSave).toHaveBeenCalledWith({
      keyResultId: 'kr-owned', progress: Number(progress), effectiveDate: '2026-08-14', note: '完成边界值验证',
    });
  });

  it.each(['-1', '101'])('rejects the out-of-range progress value %s', async (progress) => {
    const { onSave } = await completeForm(progress);

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('实际进度必须在 0 到 100 之间');
  });

  it('requires both an effective date and an update note', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<KrProgressEditor ownerId="employee-1" keyResults={keyResults} onSave={onSave} />);

    await user.clear(screen.getByLabelText('实际进度（0–100）'));
    await user.type(screen.getByLabelText('实际进度（0–100）'), '40');
    await user.click(screen.getByRole('button', { name: '保存 KR 进度' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('请填写生效日期和更新说明');
  });

  it('prevents a duplicate submission while the save is pending', async () => {
    let finishSave!: (value: { ok: true; data: { snapshotId: string } }) => void;
    const onSave = vi.fn().mockImplementation(() => new Promise((resolve) => { finishSave = resolve; }));
    const user = userEvent.setup();
    render(<KrProgressEditor ownerId="employee-1" keyResults={keyResults} onSave={onSave} />);
    await user.clear(screen.getByLabelText('实际进度（0–100）'));
    await user.type(screen.getByLabelText('实际进度（0–100）'), '60');
    await user.type(screen.getByLabelText('生效日期'), '2026-08-14');
    await user.type(screen.getByLabelText('更新说明'), '一次更新');

    const form = screen.getByRole('button', { name: '保存 KR 进度' }).closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '保存中…' })).toBeDisabled();
    finishSave({ ok: true, data: { snapshotId: 'snapshot-1' } });
  });

  it('retains every entered value when persistence fails', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: false, error: { code: 'network', message: '请求未完成，请稍后重试' } });
    await completeForm('37', onSave);

    expect(screen.getByRole('alert')).toHaveTextContent('请求未完成，请稍后重试');
    expect(screen.getByLabelText('实际进度（0–100）')).toHaveValue(37);
    expect(screen.getByLabelText('生效日期')).toHaveValue('2026-08-14');
    expect(screen.getByLabelText('更新说明')).toHaveValue('完成边界值验证');
  });
});
