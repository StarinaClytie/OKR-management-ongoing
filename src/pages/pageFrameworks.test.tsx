import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, AuthProvider, type AuthContextValue } from '../auth/AuthContext';
import { AppRoutes } from '../app/routes';
import type { OkrRepository } from '../data/types';
import { mockData, mockRepository } from '../mocks/repository';
import { OkrManagementPage } from './OkrManagementPage';

function renderRoute(userId: string, path: string) {
  return render(
    <AuthProvider initialUserId={userId}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('business route frameworks', () => {
  it.each([
    ['user-employee', '/okrs', 'OKR 管理'],
    ['user-employee', '/projects', '项目'],
    ['user-employee', '/weekly-reports', '周报'],
    ['user-employee', '/team', '团队'],
    ['user-employee', '/analytics', '分析'],
    ['user-administrator', '/settings', '设置'],
  ])('renders %s at %s as a usable %s page instead of a route placeholder', (userId, path, title) => {
    renderRoute(userId, path);

    expect(screen.getByRole('heading', { name: title })).toBeVisible();
    expect(screen.getByText('模拟数据')).toBeVisible();
    expect(screen.queryByText('页面框架将在后续迭代中补充。')).not.toBeInTheDocument();
  });

  it.each(['user-employee', 'user-hr'])('does not expose inaccessible project metadata to %s', (userId) => {
    renderRoute(userId, '/projects');

    expect(screen.getByRole('heading', { name: '项目' })).toBeVisible();
    expect(screen.queryByText('新星数据平台')).not.toBeInTheDocument();
    expect(screen.queryByText('为经营团队提供统一、可追溯的指标数据。')).not.toBeInTheDocument();
    expect(screen.queryByText('机密')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('受限内容')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('严格机密内容')).not.toBeInTheDocument();
    expect(screen.queryByText(/隐藏.*项目|项目.*隐藏/)).not.toBeInTheDocument();
  });

  it('gives a project leader their own KR update action only for an owned key result', () => {
    renderRoute('user-project-leader', '/okrs');

    expect(screen.getByRole('button', { name: '更新我的 KR' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '更新成员 KR' })).not.toBeInTheDocument();
  });

  it('persists an employee KR update through the repository, refetches, and renders recalculated status', async () => {
    const user = userEvent.setup();
    const employee = mockData.users.find((candidate) => candidate.id === 'user-employee')!;
    const initialData = { ...mockRepository.getDashboardData(employee.id), risks: [] };
    const refreshedData = {
      ...initialData,
      keyResults: initialData.keyResults.map((keyResult) => keyResult.id === 'kr-orion-onboarding'
        ? { ...keyResult, progress: 100, status: 'complete' as const }
        : keyResult),
      progressSnapshots: [...initialData.progressSnapshots, {
        id: 'snapshot-new', projectId: 'project-orion', keyResultId: 'kr-orion-onboarding', weekOf: '2026-08-14', actual: 100, planned: 70,
      }],
    };
    const dataRepository = {
      mode: 'supabase',
      getDashboardData: vi.fn()
        .mockResolvedValueOnce({ ok: true, data: initialData })
        .mockResolvedValueOnce({ ok: true, data: refreshedData }),
      saveKrProgress: vi.fn().mockResolvedValue({ ok: true, data: { snapshotId: 'snapshot-new' } }),
    } as unknown as OkrRepository;
    const authValue: AuthContextValue = {
      status: 'ready', mode: 'supabase', currentUser: employee, selectableUsers: [], selectUser: vi.fn(), signOut: vi.fn(),
    };
    render(
      <AuthContext.Provider value={authValue}>
        <MemoryRouter><OkrManagementPage dataRepository={dataRepository} /></MemoryRouter>
      </AuthContext.Provider>,
    );
    await screen.findByRole('button', { name: '更新我的 KR' });
    await user.click(screen.getByRole('button', { name: '更新我的 KR' }));
    await user.clear(screen.getByLabelText('实际进度（0–100）'));
    await user.type(screen.getByLabelText('实际进度（0–100）'), '100');
    await user.type(screen.getByLabelText('生效日期'), '2026-08-14');
    await user.type(screen.getByLabelText('更新说明'), '全部完成');
    await user.click(screen.getByRole('button', { name: '保存 KR 进度' }));

    await waitFor(() => expect(dataRepository.saveKrProgress).toHaveBeenCalledWith({
      keyResultId: 'kr-orion-onboarding', progress: 100, effectiveDate: '2026-08-14', note: '全部完成',
    }));
    expect(dataRepository.getDashboardData).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('实际完成度 100%，目标已完成')).toBeVisible();
    expect(screen.queryByText('数据不会保存')).not.toBeInTheDocument();
  });

  it('uses the latest baseline plan when a newer actual snapshot has no same-day baseline', async () => {
    const employee = mockData.users.find((candidate) => candidate.id === 'user-employee')!;
    const base = mockRepository.getDashboardData(employee.id);
    const data = {
      ...base,
      keyResults: base.keyResults.map((keyResult) => keyResult.id === 'kr-orion-onboarding' ? { ...keyResult, progress: 20 } : keyResult),
      risks: [],
      progressSnapshots: [
        { id: 'baseline-current', projectId: 'project-orion', keyResultId: 'kr-orion-onboarding', weekOf: '2026-08-10', actual: undefined, planned: 70 },
        { id: 'actual-later', projectId: 'project-orion', keyResultId: 'kr-orion-onboarding', weekOf: '2026-08-14', actual: 20, planned: 0 },
      ],
    };
    const dataRepository = { mode: 'supabase', getDashboardData: vi.fn().mockResolvedValue({ ok: true, data }) } as unknown as OkrRepository;
    const authValue: AuthContextValue = { status: 'ready', mode: 'supabase', currentUser: employee, selectableUsers: [], selectUser: vi.fn(), signOut: vi.fn() };
    render(<AuthContext.Provider value={authValue}><MemoryRouter><OkrManagementPage dataRepository={dataRepository} /></MemoryRouter></AuthContext.Provider>);

    expect(await screen.findByText('实际 20%，计划 70%，落后 50 个百分点')).toBeVisible();
  });

  it('does not escalate a KR from a risk linked only to its parent Objective', async () => {
    const employee = mockData.users.find((candidate) => candidate.id === 'user-employee')!;
    const base = mockRepository.getDashboardData(employee.id);
    const objectiveRisk = {
      ...mockData.risks[0]!, id: 'objective-risk', keyResultId: undefined, objectiveId: 'objective-orion-activation',
      probability: 3 as const, impact: 3 as const, resolved: false,
    };
    const data = { ...base, risks: [objectiveRisk], progressSnapshots: [] };
    const dataRepository = { mode: 'supabase', getDashboardData: vi.fn().mockResolvedValue({ ok: true, data }) } as unknown as OkrRepository;
    const authValue: AuthContextValue = { status: 'ready', mode: 'supabase', currentUser: employee, selectableUsers: [], selectUser: vi.fn(), signOut: vi.fn() };
    render(<AuthContext.Provider value={authValue}><MemoryRouter><OkrManagementPage dataRepository={dataRepository} /></MemoryRouter></AuthContext.Provider>);

    await screen.findByRole('heading', { name: '我的 KR 状态说明' });
    expect(screen.queryByText('存在未解决的严重风险（风险分 9）')).not.toBeInTheDocument();
  });

  it('keeps a confirmed KR write successful when the post-write refetch throws', async () => {
    const user = userEvent.setup();
    const employee = mockData.users.find((candidate) => candidate.id === 'user-employee')!;
    const data = { ...mockRepository.getDashboardData(employee.id), risks: [] };
    const dataRepository = {
      mode: 'supabase',
      getDashboardData: vi.fn().mockResolvedValueOnce({ ok: true, data }).mockRejectedValueOnce(new Error('offline')),
      saveKrProgress: vi.fn().mockResolvedValue({ ok: true, data: { snapshotId: 'saved' } }),
    } as unknown as OkrRepository;
    const authValue: AuthContextValue = { status: 'ready', mode: 'supabase', currentUser: employee, selectableUsers: [], selectUser: vi.fn(), signOut: vi.fn() };
    render(<AuthContext.Provider value={authValue}><MemoryRouter><OkrManagementPage dataRepository={dataRepository} /></MemoryRouter></AuthContext.Provider>);
    await screen.findByRole('button', { name: '更新我的 KR' });
    await user.click(screen.getByRole('button', { name: '更新我的 KR' }));
    await user.clear(screen.getByLabelText('实际进度（0–100）'));
    await user.type(screen.getByLabelText('实际进度（0–100）'), '40');
    await user.type(screen.getByLabelText('生效日期'), '2026-08-14');
    await user.type(screen.getByLabelText('更新说明'), '已保存');
    await user.click(screen.getByRole('button', { name: '保存 KR 进度' }));

    expect(await screen.findByRole('status')).toHaveTextContent('KR 进度已保存，但最新数据暂时无法加载');
    expect(screen.queryByLabelText('更新说明')).not.toBeInTheDocument();
  });

  it('creates, edits, and resolves attached employee risks through repository-backed actions', async () => {
    const user = userEvent.setup();
    const employee = mockData.users.find((candidate) => candidate.id === 'user-employee')!;
    const attachedRisk = {
      ...mockData.risks.find((risk) => risk.ownerId === employee.id)!,
      id: 'risk-owned', keyResultId: 'kr-orion-onboarding', reason: '原始依据', lastReviewedAt: '2026-08-13', resolved: false,
    };
    const data = { ...mockRepository.getDashboardData(employee.id), risks: [attachedRisk] };
    const dataRepository = {
      mode: 'supabase',
      getDashboardData: vi.fn().mockResolvedValue({ ok: true, data }),
      saveOwnedRisk: vi.fn().mockResolvedValue({ ok: true, data: { id: 'risk-owned' } }),
    } as unknown as OkrRepository;
    const authValue: AuthContextValue = {
      status: 'ready', mode: 'supabase', currentUser: employee, selectableUsers: [], selectUser: vi.fn(), signOut: vi.fn(),
    };
    render(
      <AuthContext.Provider value={authValue}>
        <MemoryRouter><OkrManagementPage dataRepository={dataRepository} /></MemoryRouter>
      </AuthContext.Provider>,
    );

    const attachedRiskList = await screen.findByRole('region', { name: '完成三项新手引导实验的关联风险' });
    expect(within(attachedRiskList).getByText(attachedRisk.title)).toBeVisible();
    expect(screen.getByRole('link', { name: '查看完整风险矩阵' })).toHaveAttribute('href', '/okrs?view=risk-matrix');
    await user.click(screen.getByRole('link', { name: '查看完整风险矩阵' }));
    expect(screen.getByRole('region', { name: '完整风险矩阵' })).toHaveTextContent(attachedRisk.title);
    await user.click(screen.getByRole('button', { name: '新增风险' }));
    expect(screen.getByRole('option', { name: 'KR · 完成三项新手引导实验' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'KR · 将七日激活率提升至 62%' })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('风险标题'), '新增事件');
    await user.type(screen.getByLabelText('判断依据'), '新增依据');
    await user.type(screen.getByLabelText('缓解措施'), '新增措施');
    await user.type(screen.getByLabelText('复核日期'), '2026-08-14');
    await user.click(screen.getByRole('button', { name: '保存风险' }));
    expect(dataRepository.saveOwnedRisk).toHaveBeenCalledWith(expect.objectContaining({ title: '新增事件', keyResultId: 'kr-orion-onboarding', resolved: false }));

    await user.click(screen.getByRole('button', { name: `编辑 ${attachedRisk.title}` }));
    expect(screen.getByLabelText('风险标题')).toHaveValue(attachedRisk.title);
    await user.clear(screen.getByLabelText('风险标题'));
    await user.type(screen.getByLabelText('风险标题'), '已编辑事件');
    await user.click(screen.getByRole('button', { name: '保存风险' }));
    expect(dataRepository.saveOwnedRisk).toHaveBeenCalledWith(expect.objectContaining({ id: 'risk-owned', title: '已编辑事件' }));
    await user.click(screen.getByRole('button', { name: `解决 ${attachedRisk.title}` }));

    await waitFor(() => expect(dataRepository.saveOwnedRisk).toHaveBeenCalledWith(expect.objectContaining({
      id: 'risk-owned', keyResultId: 'kr-orion-onboarding', resolved: true,
    })));
    expect(dataRepository.getDashboardData).toHaveBeenCalledTimes(4);
  });

  it('does not leak a same-project restricted weekly report through its summary or plan', () => {
    const restrictedReport = {
      ...mockData.weeklyReports[0]!,
      id: 'weekly-report-orion-restricted-test',
      summary: '不得显示的严格机密周报摘要',
      nextWeekPlan: '不得显示的严格机密下周计划',
      classification: 'restricted' as const,
    };
    mockData.weeklyReports.push(restrictedReport);

    try {
      renderRoute('user-project-leader', '/weekly-reports');

      expect(screen.queryByText('不得显示的严格机密周报摘要')).not.toBeInTheDocument();
      expect(screen.queryByText('不得显示的严格机密下周计划')).not.toBeInTheDocument();
    } finally {
      mockData.weeklyReports.splice(mockData.weeklyReports.indexOf(restrictedReport), 1);
    }
  });

  it('shows team members only when the shared user-read policy permits them', () => {
    renderRoute('user-project-leader', '/team');

    expect(screen.getByText('周琳')).toBeVisible();
    expect(screen.getByText('赵峰')).toBeVisible();
    expect(screen.queryByText('孙悦')).not.toBeInTheDocument();
  });
});
