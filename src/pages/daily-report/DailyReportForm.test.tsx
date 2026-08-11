import { render, screen, within } from '@testing-library/react';
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

function renderForm(options: { objectives?: Objective[]; keyResults?: KeyResult[] } = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  const user = userEvent.setup();
  render(<DailyReportForm objectives={options.objectives ?? objectives} keyResults={options.keyResults ?? keyResults} onCancel={onCancel} onSubmit={onSubmit} />);
  return { user, onSubmit, onCancel };
}

async function enterQuantityKr(user: ReturnType<typeof userEvent.setup>, values: { target: string; actual: string; progress: string }) {
  await user.type(screen.getByLabelText('KR1 目标值'), values.target);
  await user.type(screen.getByLabelText('KR1 当前实际值'), values.actual);
  await user.type(screen.getByLabelText('KR1 完成度'), values.progress);
}

describe('DailyReportForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('shows concise O help and reveals full examples only on request', async () => {
    const { user } = renderForm();

    expect(screen.getByText('建议使用动词＋结果描述今天最重要的目标')).toBeVisible();
    expect(screen.queryByText('副词＋动词＋名词')).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: '查看更多 O 写法' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);

    expect(screen.getByText('副词＋动词＋名词')).toBeVisible();
    expect(screen.getByText('动词＋对象＋结果')).toBeVisible();
    expect(screen.getByText('完成＋交付物＋用途')).toBeVisible();
    expect(screen.getByText('解决＋问题＋影响')).toBeVisible();
    expect(screen.getByText(/O 描述目标方向，不替代员工填写完成度/)).toBeVisible();
    expect(screen.getByRole('button', { name: '收起 O 写法' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('never overwrites employee-entered KR or O progress', async () => {
    const { user } = renderForm();

    await enterQuantityKr(user, { target: '20', actual: '15', progress: '70' });

    expect(screen.getByLabelText('KR1 完成度')).toHaveValue(70);
    expect(screen.getByText('公式参考：实际完成值 ÷ 目标值')).toBeVisible();
    expect(screen.getByText('KR 平均完成度参考：70%')).toBeVisible();
    expect(screen.getByLabelText('当日 O 完成度')).toHaveValue(null);

    await user.clear(screen.getByLabelText('KR1 完成度'));
    expect(screen.getByLabelText('KR1 完成度')).toHaveValue(null);
    expect(screen.getByText('KR 平均完成度参考：—')).toBeVisible();

    await user.type(screen.getByLabelText('KR1 完成度'), '0');
    expect(screen.getByLabelText('KR1 完成度')).toHaveValue(0);
    expect(screen.getByText('KR 平均完成度参考：0%')).toBeVisible();
  });

  it('does not submit until O and every KR progress were explicitly entered', async () => {
    const { user, onSubmit } = renderForm();

    await user.click(screen.getByRole('button', { name: '提交日报' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getAllByText('请填写完成度')).toHaveLength(2);

    await user.type(screen.getByLabelText('当日 O 完成度'), '0');
    await user.type(screen.getByLabelText('KR1 完成度'), '0');
    await user.click(screen.getByRole('button', { name: '提交日报' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ objectiveProgress: 0 }));
    expect(screen.getByLabelText('当日 O 完成度')).toHaveValue(0);
    expect(screen.getByLabelText('KR1 完成度')).toHaveValue(0);
  });

  it('switches type fields and the single concise help card', async () => {
    const { user, onSubmit } = renderForm();

    await user.selectOptions(screen.getByLabelText('KR1 度量类型'), 'milestone');

    expect(screen.getByLabelText('KR1 截止日期')).toBeVisible();
    expect(screen.getByLabelText('KR1 当前状态')).toBeVisible();
    expect(screen.queryByLabelText('KR1 目标值')).not.toBeInTheDocument();
    expect(screen.getByText('完成可填写 100%，未完成可填写 0%')).toBeVisible();
    expect(screen.getByRole('complementary', { name: '填写帮助' })).toHaveTextContent('依据截止日期与当前状态自行判断');
    expect(screen.getByLabelText('KR1 当前状态')).toHaveValue('not_started');
    expect(screen.getByRole('button', { name: '查看完整规则' })).toHaveAttribute('aria-expanded', 'false');
    await user.click(screen.getByRole('button', { name: '查看完整规则' }));
    expect(screen.getByText(/里程碑完成度仍由员工结合当前状态填写/)).toBeVisible();
    expect(screen.getByRole('button', { name: '收起完整规则' })).toHaveAttribute('aria-expanded', 'true');

    await user.type(screen.getByLabelText('当日 O 完成度'), '0');
    await user.type(screen.getByLabelText('KR1 完成度'), '0');
    await user.click(screen.getByRole('button', { name: '提交日报' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      keyResults: [expect.objectContaining({ type: 'milestone', milestoneStatus: 'not_started', progress: 0 })],
    }));
  });

  it('places the single help card directly inside the active KR on mobile', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const { user } = renderForm();
    await user.click(screen.getByRole('button', { name: '添加 KR' }));
    await user.selectOptions(screen.getByLabelText('KR2 度量类型'), 'ratio');

    expect(within(screen.getByRole('group', { name: '当日 KR 2' })).getByLabelText('填写帮助')).toHaveTextContent('比率型填写参考');
    expect(screen.queryByRole('complementary', { name: '填写帮助' })).not.toBeInTheDocument();
  });

  it('clears stale type fields, preserves manual progress, and requires subjective acceptance criteria', async () => {
    const { user, onSubmit } = renderForm();

    await enterQuantityKr(user, { target: '20', actual: '15', progress: '75' });
    await user.type(screen.getByLabelText('当日 O 完成度'), '60');
    await user.selectOptions(screen.getByLabelText('KR1 度量类型'), 'ratio');
    expect(screen.getByLabelText('KR1 完成度')).toHaveValue(75);
    expect(screen.getByLabelText('KR1 起始值')).toHaveValue(null);
    expect(screen.getByLabelText('KR1 目标值')).toHaveValue(null);
    expect(screen.getByLabelText('KR1 当前值')).toHaveValue(null);

    await user.type(screen.getByLabelText('KR1 起始值'), '40');
    await user.selectOptions(screen.getByLabelText('KR1 度量类型'), 'subjective');
    expect(screen.queryByLabelText('KR1 起始值')).not.toBeInTheDocument();
    expect(screen.getByLabelText('KR1 验收标准')).toBeRequired();
    await user.click(screen.getByRole('button', { name: '提交日报' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('请填写主观型 KR 的验收标准')).toBeVisible();

    await user.type(screen.getByLabelText('KR1 验收标准'), '评审人确认材料可直接用于决策');
    await user.click(screen.getByRole('button', { name: '提交日报' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      keyResults: [expect.objectContaining({
        type: 'subjective',
        progress: 75,
        acceptanceCriteria: '评审人确认材料可直接用于决策',
        targetValue: undefined,
        actualValue: undefined,
        baselineValue: undefined,
        milestoneStatus: undefined,
      })],
    }));
  });

  it('never changes progress when target, actual, status, or type changes', async () => {
    const { user } = renderForm();
    await user.type(screen.getByLabelText('KR1 完成度'), '35');
    await user.type(screen.getByLabelText('KR1 目标值'), '20');
    await user.type(screen.getByLabelText('KR1 当前实际值'), '15');
    await user.selectOptions(screen.getByLabelText('KR1 度量类型'), 'milestone');
    await user.selectOptions(screen.getByLabelText('KR1 当前状态'), 'completed');
    expect(screen.getByLabelText('KR1 完成度')).toHaveValue(35);
  });

  it('deletes and reorders KRs while keeping stable, never-reused IDs and current numbering', async () => {
    const { user } = renderForm();
    const firstId = screen.getByLabelText('KR1').id;
    await user.type(screen.getByLabelText('KR1'), '第一个结果');
    await user.click(screen.getByRole('button', { name: '添加 KR' }));
    await user.type(screen.getByLabelText('KR2'), '第二个结果');
    const secondId = screen.getByLabelText('KR2').id;

    await user.click(screen.getByRole('button', { name: '上移 KR2' }));
    expect(screen.getByLabelText('KR1')).toHaveValue('第二个结果');
    expect(screen.getByLabelText('KR1').id).toBe(secondId);
    expect(screen.getByLabelText('KR2').id).toBe(firstId);

    await user.click(screen.getByRole('button', { name: '删除 KR2' }));
    expect(screen.getByRole('button', { name: '删除 KR1' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '添加 KR' }));
    expect(screen.getByLabelText('KR2').id).not.toBe(firstId);
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

  it('renders only the OKR options supplied by the permission-filtered parent boundary', () => {
    renderForm({ objectives, keyResults });

    expect(screen.getByRole('option', { name: '提升新用户激活体验' })).toBeInTheDocument();
    expect(screen.queryByText('受限经营目标')).not.toBeInTheDocument();
    expect(screen.queryByText('受限经营 KR')).not.toBeInTheDocument();
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
