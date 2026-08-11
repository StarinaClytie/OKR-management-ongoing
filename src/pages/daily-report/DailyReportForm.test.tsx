import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { KeyResult, Objective } from '../../domain/types';
import { DailyReportForm } from './DailyReportForm';

const objectives: Objective[] = [{
  id: 'objective-orion',
  projectId: 'project-orion',
  title: '提升新用户激活体验',
  description: '通过关键路径优化提升激活。',
  ownerId: 'user-employee',
  progress: 60,
  status: 'on_track',
  startDate: '2026-08-01',
  dueDate: '2026-08-31',
  classification: 'internal',
}];

const keyResults: KeyResult[] = [{
  id: 'kr-orion',
  objectiveId: 'objective-orion',
  title: '完成 20 条数据收集',
  ownerId: 'user-employee',
  progress: 20,
  status: 'on_track',
  startDate: '2026-08-01',
  dueDate: '2026-08-31',
  classification: 'internal',
}];

function renderForm() {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  const user = userEvent.setup();
  render(<DailyReportForm objectives={objectives} keyResults={keyResults} onCancel={onCancel} onSubmit={onSubmit} />);
  return { user, onSubmit, onCancel };
}

async function enterQuantityKr(user: ReturnType<typeof userEvent.setup>, values: { target: string; actual: string; progress: string }) {
  await user.type(screen.getByLabelText('KR1 目标值'), values.target);
  await user.type(screen.getByLabelText('KR1 当前实际值'), values.actual);
  await user.type(screen.getByLabelText('KR1 完成度'), values.progress);
}

describe('DailyReportForm', () => {
  it('shows concise O help and reveals full examples only on request', async () => {
    const { user } = renderForm();

    expect(screen.getByText('建议使用动词＋结果描述今天最重要的目标')).toBeVisible();
    expect(screen.queryByText('副词＋动词＋名词')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '查看更多 O 写法' }));

    expect(screen.getByText('副词＋动词＋名词')).toBeVisible();
  });

  it('never overwrites employee-entered KR or O progress', async () => {
    const { user } = renderForm();

    await enterQuantityKr(user, { target: '20', actual: '15', progress: '70' });

    expect(screen.getByLabelText('KR1 完成度')).toHaveValue(70);
    expect(screen.getByText('公式参考：实际完成值 ÷ 目标值')).toBeVisible();
    expect(screen.getByText('KR 平均完成度参考：70%')).toBeVisible();
    expect(screen.getByLabelText('当日 O 完成度')).toHaveValue(null);
  });

  it('switches type fields and the single concise help card', async () => {
    const { user } = renderForm();

    await user.selectOptions(screen.getByLabelText('KR1 度量类型'), 'milestone');

    expect(screen.getByLabelText('KR1 截止日期')).toBeVisible();
    expect(screen.getByLabelText('KR1 当前状态')).toBeVisible();
    expect(screen.queryByLabelText('KR1 目标值')).not.toBeInTheDocument();
    expect(screen.getByText('完成可填写 100%，未完成可填写 0%')).toBeVisible();
    expect(screen.getByRole('complementary', { name: '填写帮助' })).toHaveTextContent('依据截止日期与当前状态自行判断');
  });

  it('supports multiple KRs, validated manual progress, OKR links, and classified evidence without AI controls', async () => {
    const { user } = renderForm();

    expect(screen.getAllByRole('group', { name: /当日 KR/ })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: '添加 KR' }));
    expect(screen.getAllByRole('group', { name: /当日 KR/ })).toHaveLength(2);

    await user.type(screen.getByLabelText('KR1 本日工时'), '3.5');
    await user.type(screen.getByLabelText('KR1 完成度'), '101');

    expect(screen.getByText('完成度需填写 0%～100%')).toBeVisible();
    expect(screen.getByLabelText('关联已有 O')).toBeVisible();
    expect(screen.getByLabelText('关联已有 KR（可选）')).toBeVisible();
    expect(screen.getByRole('button', { name: '添加成果附件或链接' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /AI/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '添加成果附件或链接' }));
    expect(screen.getByLabelText('成果 1 密级')).toBeVisible();
  });

  it('submits only values the employee entered', async () => {
    const { user, onSubmit } = renderForm();

    await user.type(screen.getByLabelText('当日 O'), '完成数据收集，为评审提供依据');
    await user.type(screen.getByLabelText('当日 O 完成度'), '60');
    await user.type(screen.getByLabelText('KR1'), '完成 20 条数据收集');
    await user.type(screen.getByLabelText('KR1 本日工时'), '3.5');
    await user.type(screen.getByLabelText('KR1 完成度'), '75');
    await user.click(screen.getByRole('button', { name: '提交日报' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      dailyObjective: '完成数据收集，为评审提供依据',
      objectiveProgress: 60,
      keyResults: [expect.objectContaining({ title: '完成 20 条数据收集', hours: 3.5, progress: 75 })],
    }));
  });
});
