import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ProgressPlanEditor } from './ProgressPlanEditor';

it('validates and saves an owner-entered progress baseline', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn().mockResolvedValue({ ok: true });
  render(<ProgressPlanEditor kr={{ id: 'kr-1', startDate: '2026-08-01', dueDate: '2026-08-31', measurementType: 'percentage', targetValue: 100 }} initialPoints={[]} onSave={onSave} />);
  await user.click(screen.getByRole('button', { name: '添加计划点' }));
  await user.type(screen.getByLabelText('计划日期 1'), '2026-08-31');
  await user.type(screen.getByLabelText('计划完成度 1'), '100');
  await user.click(screen.getByRole('button', { name: '保存计划进度' }));
  expect(onSave).toHaveBeenCalledWith('kr-1', [{ date: '2026-08-31', value: 100 }]);
});
