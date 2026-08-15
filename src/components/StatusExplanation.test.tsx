import { render, screen } from '@testing-library/react';
import { StatusExplanation } from './StatusExplanation';

it('explains status with text instead of color alone', () => {
  render(<StatusExplanation result={{ status: 'at_risk', reasons: [
    { code: 'behind_plan', severity: 'at_risk', actual: 55, planned: 72, gap: -17 },
    { code: 'overdue_milestone', severity: 'at_risk', dueDate: '2026-08-12' },
  ] }} />);
  expect(screen.getByText('实际 55%，计划 72%，落后 17 个百分点')).toBeVisible();
  expect(screen.getByText('存在逾期未完成里程碑（计划日期 2026-08-12）')).toBeVisible();
});
