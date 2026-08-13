import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockRepository } from '../../mocks/repository';
import { AlignmentTreeWidget } from './AlignmentTreeWidget';
import { GanttChartWidget } from './GanttChartWidget';
import { ProgressTrendWidget } from './ProgressTrendWidget';
import { ProjectVisualizationsWidget, VisualizationLoadingFallback } from './ProjectVisualizationsWidget';
import { RiskMatrixWidget } from './RiskMatrixWidget';

const leaderData = mockRepository.getDashboardData('user-project-leader');

function mockVisualizationViewport(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((media: string) => ({
    media,
    get matches() { return matches; },
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
  })));
  return (nextMatches: boolean) => {
    matches = nextMatches;
    act(() => listeners.forEach((listener) => listener({ matches, media: '(max-width: 767px)' } as MediaQueryListEvent)));
  };
}

describe('ProjectVisualizationsWidget', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders mobile summaries only after matchMedia enters the narrow breakpoint', async () => {
    const setMobile = mockVisualizationViewport(false);
    render(<ProjectVisualizationsWidget data={leaderData} />);
    await screen.findByText('从项目目标向下查看 Objective、KR 与负责人。');

    expect(screen.queryByText('OKR 对齐摘要')).not.toBeInTheDocument();

    setMobile(true);

    expect(await screen.findByText('OKR 对齐摘要')).toBeVisible();
    expect(screen.getByText('查看详情')).toBeVisible();
  });

  it('provides an accessible status for the Suspense loading fallback', () => {
    render(<VisualizationLoadingFallback />);

    expect(screen.getByRole('status')).toHaveTextContent('正在加载项目视图');
  });

  it.each(['对齐树', '甘特图', '进度趋势', '风险矩阵', '工作负载'])(
    'switches visible content to %s without retaining the previous panel',
    async (label) => {
      const user = userEvent.setup();
      render(<ProjectVisualizationsWidget data={leaderData} />);

      await user.click(screen.getByRole('tab', { name: label }));

      expect(screen.getByRole('tabpanel', { name: label })).toBeVisible();
      expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    },
  );

  it('uses role-appropriate defaults', () => {
    const { rerender } = render(
      <ProjectVisualizationsWidget data={mockRepository.getDashboardData('user-employee')} />,
    );
    expect(screen.getByRole('tab', { name: '进度趋势' })).toHaveAttribute('aria-selected', 'true');

    rerender(<ProjectVisualizationsWidget data={mockRepository.getDashboardData('user-hr')} />);
    expect(screen.getByRole('tab', { name: '工作负载' })).toHaveAttribute('aria-selected', 'true');
  });

  it('moves and activates tabs with arrow, Home, and End keys', () => {
    render(<ProjectVisualizationsWidget data={leaderData} />);
    const alignmentTab = screen.getByRole('tab', { name: '对齐树' });
    alignmentTab.focus();

    fireEvent.keyDown(alignmentTab, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: '甘特图' })).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: '甘特图' })).toBeVisible();

    fireEvent.keyDown(screen.getByRole('tab', { name: '甘特图' }), { key: 'End' });
    expect(screen.getByRole('tab', { name: '工作负载' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('tab', { name: '工作负载' }), { key: 'Home' });
    expect(screen.getByRole('tab', { name: '对齐树' })).toHaveFocus();
  });

  it('connects every selected tab to the rendered panel', async () => {
    const user = userEvent.setup();
    render(<ProjectVisualizationsWidget data={leaderData} />);
    const ganttTab = screen.getByRole('tab', { name: '甘特图' });

    await user.click(ganttTab);

    expect(ganttTab).toHaveAttribute('aria-controls', screen.getByRole('tabpanel').id);
  });

  it('never declares an aria-controls IDREF for a panel that is not mounted', async () => {
    const user = userEvent.setup();
    render(<ProjectVisualizationsWidget data={leaderData} />);

    for (const tab of screen.getAllByRole('tab')) {
      const controlledId = tab.getAttribute('aria-controls');
      if (tab.getAttribute('aria-selected') === 'true') {
        expect(controlledId).not.toBeNull();
        expect(document.getElementById(controlledId!)).toBeInTheDocument();
      } else {
        expect(controlledId).toBeNull();
      }
    }

    await user.click(screen.getByRole('tab', { name: '风险矩阵' }));
    const riskTab = screen.getByRole('tab', { name: '风险矩阵' });
    expect(document.getElementById(riskTab.getAttribute('aria-controls')!)).toBe(
      screen.getByRole('tabpanel', { name: '风险矩阵' }),
    );
  });

  it('makes the narrow-screen risk matrix scroll container keyboard reachable', async () => {
    const user = userEvent.setup();
    render(<ProjectVisualizationsWidget data={leaderData} />);

    await user.click(screen.getByRole('tab', { name: '风险矩阵' }));

    const scrollRegion = screen.getByRole('region', { name: '风险矩阵，可横向滚动' });
    expect(scrollRegion).toHaveAttribute('tabindex', '0');
    scrollRegion.focus();
    expect(scrollRegion).toHaveFocus();
  });

  it('marks a project leader owned KR as mine', () => {
    render(
      <AlignmentTreeWidget
        data={{ ...leaderData, currentUser: { ...leaderData.currentUser, name: '周明' } }}
      />,
    );

    expect(screen.getByText('周明（我）')).toBeVisible();
  });

  it('renders the company O to project O to KR hierarchy from one authorized model', () => {
    render(<AlignmentTreeWidget data={leaderData} />);

    expect(screen.getByText('公司 O')).toBeVisible();
    expect(screen.getByText('提升客户价值与可持续增长')).toBeVisible();
    expect(screen.getByText('让新用户在首周感受到核心价值')).toBeVisible();
    expect(screen.getByText('将七日激活率提升至 62%')).toBeVisible();
  });

  it('groups each project beneath its linked authorized company objective', () => {
    const second = { ...leaderData.companyObjectives[0]!, id: 'company-second', title: '第二个公司目标' };
    const data = {
      ...leaderData,
      companyObjectives: [...leaderData.companyObjectives, second],
      projects: leaderData.projects.map((project, index) => ({ ...project, companyObjectiveId: index === 0 ? leaderData.companyObjectives[0]!.id : second.id })),
    };
    render(<AlignmentTreeWidget data={data} />);

    const firstGroup = screen.getByRole('region', { name: `公司目标：${leaderData.companyObjectives[0]!.title}` });
    const secondGroup = screen.getByRole('region', { name: '公司目标：第二个公司目标' });
    expect(firstGroup).toHaveTextContent(data.projects[0]!.name);
    expect(firstGroup).not.toHaveTextContent(data.projects[1]!.name);
    expect(secondGroup).toHaveTextContent(data.projects[1]!.name);
    expect(secondGroup).not.toHaveTextContent(data.projects[0]!.name);
  });

  it('does not attach projects to an unauthorized company objective', () => {
    const secret = { ...leaderData.companyObjectives[0]!, id: 'company-secret', title: '受限公司目标名称', classification: 'restricted' as const };
    const data = { ...leaderData, companyObjectives: [...leaderData.companyObjectives, secret], projects: leaderData.projects.map((project, index) => index === 0 ? { ...project, companyObjectiveId: secret.id } : project) };
    render(<AlignmentTreeWidget data={data} />);
    expect(screen.queryByText(secret.title)).not.toBeInTheDocument();
    expect(screen.getByText(data.projects[0]!.name)).toBeVisible();
  });

  it('includes separately modeled tasks beneath their authorized KR in the Gantt chart', () => {
    render(<GanttChartWidget data={leaderData} />);

    expect(screen.getByText('任务：完成新手引导实验设计')).toBeVisible();
    expect(screen.getByText(/关联 KR：将七日激活率提升至 62%/)).toBeVisible();
  });

  it('does not render a restricted company objective through the alignment hierarchy', () => {
    const secret = '不得泄漏的严格机密公司目标';
    const data = {
      ...leaderData,
      companyObjectives: leaderData.companyObjectives.map((objective) => ({
        ...objective,
        title: secret,
        classification: 'restricted' as const,
      })),
    };

    const { container } = render(<AlignmentTreeWidget data={data} />);

    expect(container).not.toHaveTextContent(secret);
  });

  it('does not render a restricted project task through an authorized KR', () => {
    const secret = '不得泄漏的严格机密项目任务';
    const data = {
      ...leaderData,
      projectTasks: leaderData.projectTasks.map((task) => ({
        ...task,
        title: secret,
        classification: 'restricted' as const,
      })),
    };

    const { container } = render(<GanttChartWidget data={data} />);

    expect(container).not.toHaveTextContent(secret);
  });

  it('opens an authorized risk into a real in-place detail panel instead of a fragment-only link', async () => {
    const user = userEvent.setup();
    render(<RiskMatrixWidget data={leaderData} />);

    await user.click(screen.getByRole('button', { name: '查看风险详情：实验样本量不足' }));

    const panel = screen.getByRole('region', { name: '风险详情' });
    expect(panel).toHaveTextContent('实验样本量不足');
    expect(panel).toHaveTextContent('按周监控流量并准备合并实验方案。');
  });

  it('never leaves denied labels in text, accessible names, or hidden panels', async () => {
    const user = userEvent.setup();
    const sensitiveLabel = '禁止泄漏的严格机密任务名称';
    const restrictedData = {
      ...leaderData,
      keyResults: leaderData.keyResults.map((keyResult) =>
        keyResult.id === 'kr-orion-onboarding'
          ? { ...keyResult, title: sensitiveLabel, classification: 'restricted' as const }
          : keyResult,
      ),
    };
    const { container } = render(<ProjectVisualizationsWidget data={restrictedData} />);

    expect(container).not.toHaveTextContent(sensitiveLabel);
    expect(container.querySelector(`[aria-label*="${sensitiveLabel}"]`)).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '甘特图' }));
    expect(container).not.toHaveTextContent(sensitiveLabel);
    expect(container.querySelector(`[title*="${sensitiveLabel}"]`)).not.toBeInTheDocument();
  });

  it('does not mount a restricted risk label after opening the risk matrix', async () => {
    const user = userEvent.setup();
    const sensitiveLabel = '严格机密风险不应进入风险矩阵';
    const restrictedData = {
      ...leaderData,
      risks: leaderData.risks.map((risk) =>
        risk.id === 'risk-orion-sample-size'
          ? { ...risk, title: sensitiveLabel, classification: 'restricted' as const }
          : risk,
      ),
    };
    const { container } = render(<ProjectVisualizationsWidget data={restrictedData} />);

    await user.click(screen.getByRole('tab', { name: '风险矩阵' }));

    expect(container).not.toHaveTextContent(sensitiveLabel);
    expect(container.querySelector(`[aria-label*="${sensitiveLabel}"]`)).not.toBeInTheDocument();
    expect(container.querySelector(`[href*="risk-orion-sample-size"]`)).not.toBeInTheDocument();
  });

  it('renders twelve authorized weekly points with directly identified series', () => {
    render(<ProgressTrendWidget data={leaderData} />);

    expect(screen.getByText('12 个周度数据点')).toBeVisible();
    expect(screen.getByText('实际进度（实线）')).toBeVisible();
    expect(screen.getByText('计划进度（由负责人设置）')).toBeVisible();
    expect(screen.getByText('单位：完成度 %')).toBeVisible();
    expect(screen.getByText('计算说明').tagName).toBe('SUMMARY');
  });

  it('labels Gantt baselines as owner-entered planned dates with an explanation disclosure', () => {
    render(<GanttChartWidget data={leaderData} />);
    expect(screen.getByText('基准计划（计划日期）')).toBeVisible();
    expect(screen.getByText('计算说明').tagName).toBe('SUMMARY');
  });

  it('falls back to KPI comparison when fewer than eight authorized points remain', () => {
    render(<ProgressTrendWidget data={{ ...leaderData, progressSnapshots: leaderData.progressSnapshots.slice(0, 7) }} />);

    expect(screen.getByText('数据不足，暂不绘制趋势线')).toBeVisible();
    expect(screen.getByLabelText('最新实际进度')).toHaveTextContent('46%');
    expect(screen.queryByText('12 个周度数据点')).not.toBeInTheDocument();
  });

  it('shows HR workload fields without ever rendering report bodies', () => {
    const hrData = mockRepository.getDashboardData('user-hr');
    const secretReportBody = hrData.dailyReports[0].content;
    render(<ProjectVisualizationsWidget data={hrData} />);

    expect(screen.getByRole('tabpanel', { name: '工作负载' })).toBeVisible();
    expect(screen.getAllByText('计划工时')[0]).toBeVisible();
    expect(screen.getAllByText('已记录工时')[0]).toBeVisible();
    expect(screen.getAllByText('可用容量')[0]).toBeVisible();
    expect(screen.queryByText(secretReportBody)).not.toBeInTheDocument();
  });
});
