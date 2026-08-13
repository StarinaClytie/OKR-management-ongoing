import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { RiskEditor } from './RiskEditor';

it('requires explained risk inputs and saves the calculated level', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn().mockResolvedValue({ ok: true });
  render(<RiskEditor projectId="project-1" onSave={onSave} />);
  await user.type(screen.getByLabelText('风险标题'), '交付风险');
  await user.selectOptions(screen.getByLabelText('发生概率'), '2');
  await user.selectOptions(screen.getByLabelText('业务影响'), '3');
  await user.type(screen.getByLabelText('判断依据'), '依赖方延期');
  await user.type(screen.getByLabelText('缓解措施'), '准备替代方案');
  await user.type(screen.getByLabelText('复核日期'), '2026-08-13');
  await user.click(screen.getByRole('button', { name: '保存风险' }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ probability: 2, impact: 3, level: 'high', reason: '依赖方延期' }));
});
