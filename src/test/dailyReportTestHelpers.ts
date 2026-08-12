import { screen } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';

interface QuantityKrValues {
  index?: number;
  title?: string;
  hours?: string;
  target?: string;
  actual?: string;
  workNote?: string;
  progress?: string;
}

export async function completeQuantityKr(
  user: ReturnType<typeof userEvent.setup>,
  values: QuantityKrValues = {},
) {
  const prefix = `KR${values.index ?? 1}`;
  await user.type(screen.getByLabelText(prefix), values.title ?? '完成可验证的关键结果');
  await user.type(screen.getByLabelText(`${prefix} 本日工时`), values.hours ?? '2');
  await user.type(screen.getByLabelText(`${prefix} 目标值`), values.target ?? '10');
  await user.type(screen.getByLabelText(`${prefix} 当前实际值`), values.actual ?? '6');
  await user.type(screen.getByLabelText(`${prefix} 工作说明`), values.workNote ?? '已完成验证并记录结果');
  await user.type(screen.getByLabelText(`${prefix} 完成度`), values.progress ?? '60');
}
