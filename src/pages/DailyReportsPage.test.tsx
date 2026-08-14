import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '../auth/AuthContext';
import { AppRoutes } from '../app/routes';
import { mockData } from '../mocks/repository';
import { completeQuantityKr } from '../test/dailyReportTestHelpers';
import { resolveDailyAuthoringContext } from './DailyReportsPage';

function renderPageAs(userId: string) {
  return render(
    <AuthProvider initialUserId={userId}>
      <MemoryRouter initialEntries={['/daily-reports']}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('DailyReportsPage', () => {
  it('prefers the exact authorized historical objective before a same-project fallback', () => {
    const employee = mockData.users.find((user) => user.id === 'user-employee')!;
    const report = mockData.dailyReports.find((candidate) => candidate.authorId === employee.id)!;
    const exactObjective = mockData.objectives.find((objective) => objective.id === report.objectiveId)!;
    const sameProjectObjective = { ...exactObjective, id: 'objective-orion-other-test' };

    const context = resolveDailyAuthoringContext(employee, [report], [sameProjectObjective, exactObjective]);

    expect(context?.objective.id).toBe(report.objectiveId);
  });

  it('lets the project leader begin their own daily report', () => {
    renderPageAs('user-project-leader');

    expect(screen.getByRole('button', { name: '填写今日日报' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '编辑我的日报' })).toBeEnabled();
  });

  it('lets an employee submit a structured daily O and KR with self-entered progress', async () => {
    const user = userEvent.setup();
    const repositoryReportCount = mockData.dailyReports.length;
    renderPageAs('user-employee');

    await user.click(screen.getByRole('button', { name: '填写今日日报' }));
    await user.type(screen.getByLabelText('当日 O'), '完成原型验证，为评审提供依据');
    await user.type(screen.getByLabelText('当日 O 完成度'), '60');
    await completeQuantityKr(user, {
      title: '完成 20 条数据收集',
      hours: '3.5',
      target: '20',
      actual: '15',
      workNote: '已完成数据收集并记录验证结果',
      progress: '75',
    });
    await user.click(screen.getByRole('button', { name: '添加成果附件或链接' }));
    await user.type(screen.getByLabelText('成果 1', { selector: 'input' }), '原型评审链接');
    await user.selectOptions(screen.getByLabelText('成果 1 密级'), 'confidential');
    await user.click(screen.getByRole('button', { name: '提交日报' }));

    expect(screen.getByText('完成原型验证，为评审提供依据')).toBeVisible();
    expect(screen.getByText('75%')).toBeVisible();
    expect(screen.getByText('3.5 小时')).toBeVisible();
    expect(screen.getAllByText('成果密级：机密').length).toBeGreaterThan(0);
    expect(screen.getByText('日报已保存。')).toBeVisible();
    expect(mockData.dailyReports).toHaveLength(repositoryReportCount);
  });

  it('keeps same-day local report row keys unique across repeated submissions', async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderPageAs('user-employee');

    const submitReport = async (objective: string) => {
      await user.click(screen.getByRole('button', { name: '填写今日日报' }));
      await user.type(screen.getByLabelText('当日 O'), objective);
      await user.type(screen.getByLabelText('当日 O 完成度'), '60');
      await completeQuantityKr(user, { progress: '75' });
      await user.click(screen.getByRole('button', { name: '提交日报' }));
    };

    try {
      await submitReport('第一次同日提交');
      await submitReport('第二次同日提交');

      expect(screen.getByText('第一次同日提交')).toBeVisible();
      expect(screen.getByText('第二次同日提交')).toBeVisible();
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('moves focus into authoring and restores it after cancel or successful submit', async () => {
    const user = userEvent.setup();
    renderPageAs('user-employee');
    const authorButton = screen.getByRole('button', { name: '填写今日日报' });

    await user.click(authorButton);
    expect(screen.getByLabelText('当日 O')).toHaveFocus();

    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(authorButton).toHaveFocus();

    await user.click(authorButton);
    await user.type(screen.getByLabelText('当日 O'), '完成焦点恢复验证');
    await user.type(screen.getByLabelText('当日 O 完成度'), '60');
    await completeQuantityKr(user, { progress: '75' });
    await user.click(screen.getByRole('button', { name: '提交日报' }));

    expect(authorButton).toHaveFocus();
  });

  it('keeps the form open with one explicit error when typed conversion fails closed', async () => {
    const user = userEvent.setup();
    const linkedKeyResult = mockData.keyResults.find((keyResult) => keyResult.id === 'kr-orion-onboarding')!;
    const originalObjectiveId = linkedKeyResult.objectiveId;
    renderPageAs('user-employee');

    await user.click(screen.getByRole('button', { name: '填写今日日报' }));
    await user.type(screen.getByLabelText('当日 O'), '完成关联失败验证');
    await user.type(screen.getByLabelText('当日 O 完成度'), '60');
    await completeQuantityKr(user, { progress: '75' });
    await user.selectOptions(screen.getByLabelText('关联已有 O'), 'objective-orion-activation');
    await user.selectOptions(screen.getByLabelText('KR1 关联已有 KR（可选）'), linkedKeyResult.id);
    linkedKeyResult.objectiveId = 'objective-nova-trust';

    try {
      await user.click(screen.getByRole('button', { name: '提交日报' }));

      expect(screen.getByLabelText('当日 O')).toBeVisible();
      expect(screen.getAllByRole('status')).toHaveLength(1);
      expect(screen.getByRole('status')).toHaveTextContent('所关联的 KR 不属于最终 O');
      expect(screen.queryByText('日报已保存。')).not.toBeInTheDocument();
    } finally {
      linkedKeyResult.objectiveId = originalObjectiveId;
    }
  });

  it('offers review actions but not edit for a member report', () => {
    renderPageAs('user-project-leader');

    expect(screen.getByRole('button', { name: '确认成员日报' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '退回成员日报' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '添加评论' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '编辑成员日报' })).not.toBeInTheDocument();
  });

  it('keeps a project leader in author mode for self and review-only mode for members', () => {
    renderPageAs('user-project-leader');

    expect(screen.getByRole('button', { name: '填写今日日报' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '确认成员日报' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '编辑成员日报' })).not.toBeInTheDocument();
  });

  it('lets an employee edit only their own report without project review actions', () => {
    renderPageAs('user-employee');

    expect(screen.getByRole('button', { name: '编辑我的日报' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '确认成员日报' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '添加评论' })).not.toBeInTheDocument();
  });

  it('opens the selected own report in the real structured edit form and restores focus on cancel', async () => {
    const user = userEvent.setup();
    renderPageAs('user-employee');
    const editButton = screen.getByRole('button', { name: '编辑我的日报' });
    await user.click(editButton);
    const heading = screen.getByRole('heading', { name: '编辑我的日报' });
    expect(heading).toHaveFocus();
    expect(screen.getByLabelText('当日 O')).not.toHaveValue('');
    expect(screen.getByRole('button', { name: '保存日报修改' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(editButton).toHaveFocus();
  });

  it('keeps HR on an hours-only view without confidential report fields', () => {
    renderPageAs('user-hr');

    expect(screen.getByRole('table', { name: '授权工时日报' })).toBeVisible();
    expect(screen.getByRole('columnheader', { name: '工时' })).toBeVisible();
    expect(screen.queryByRole('columnheader', { name: '日报内容' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '证据' })).not.toBeInTheDocument();
    expect(screen.queryByText('完成引导文案的用户访谈整理，并提交实验配置。')).not.toBeInTheDocument();
    expect(screen.queryByText('用户访谈纪要')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '填写今日日报' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('当日 O')).not.toBeInTheDocument();
  });

  it('keeps management out of daily report authoring', () => {
    renderPageAs('user-management');

    expect(screen.queryByRole('button', { name: '填写今日日报' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('当日 O')).not.toBeInTheDocument();
  });

  it('does not offer unauthorized OKR titles or AI controls', async () => {
    const user = userEvent.setup();
    const restrictedObjective = {
      ...mockData.objectives[0]!,
      id: 'objective-orion-restricted-test',
      title: '严格机密经营目标',
      classification: 'restricted' as const,
    };
    const restrictedKeyResult = {
      ...mockData.keyResults[0]!,
      id: 'kr-orion-restricted-test',
      objectiveId: restrictedObjective.id,
      title: '严格机密关键成果',
      classification: 'restricted' as const,
    };
    mockData.objectives.push(restrictedObjective);
    mockData.keyResults.push(restrictedKeyResult);

    try {
      renderPageAs('user-employee');

      await user.click(screen.getByRole('button', { name: '填写今日日报' }));

      expect(screen.queryByRole('option', { name: '严格机密经营目标' })).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: '严格机密关键成果' })).not.toBeInTheDocument();
      expect(document.body.innerHTML).not.toContain('严格机密经营目标');
      expect(document.body.innerHTML).not.toContain('严格机密关键成果');
      expect(screen.queryByRole('button', { name: /AI/ })).not.toBeInTheDocument();
    } finally {
      mockData.keyResults.splice(mockData.keyResults.indexOf(restrictedKeyResult), 1);
      mockData.objectives.splice(mockData.objectives.indexOf(restrictedObjective), 1);
    }
  });

  it('authorizes a blank authoring flow from an accessible project, not another report', async () => {
    const user = userEvent.setup();
    const employeeReport = mockData.dailyReports.find((report) => report.authorId === 'user-employee')!;
    const employeeReportIndex = mockData.dailyReports.indexOf(employeeReport);
    mockData.dailyReports.splice(employeeReportIndex, 1);

    try {
      renderPageAs('user-employee');
      await user.click(screen.getByRole('button', { name: '填写今日日报' }));

      expect(screen.getByLabelText('当日 O')).toBeVisible();
      expect(screen.queryByText('完成首周激活漏斗复盘，并确认下一轮实验的优先级。')).not.toBeInTheDocument();
    } finally {
      mockData.dailyReports.splice(employeeReportIndex, 0, employeeReport);
    }
  });
});
