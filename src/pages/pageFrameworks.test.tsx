import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { AppRoutes } from '../app/routes';
import { mockData } from '../mocks/repository';

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
    ['user-employee', '/reports', '日报'],
    ['user-employee', '/team', '团队'],
    ['user-administrator', '/settings', '设置'],
  ])('renders %s at %s as a usable %s page instead of a route placeholder', (userId, path, title) => {
    renderRoute(userId, path);

    expect(screen.getByRole('heading', { name: title })).toBeVisible();
    expect(screen.queryByText('模拟数据')).not.toBeInTheDocument();
    expect(screen.getByText('工作区')).toBeVisible();
    expect(screen.queryByText('页面框架将在后续迭代中补充。')).not.toBeInTheDocument();
  });

  it.each(['user-employee'])('does not expose inaccessible project metadata to %s', (userId) => {
    renderRoute(userId, '/projects');

    expect(screen.getByRole('heading', { name: '项目' })).toBeVisible();
    expect(screen.queryByText('新星数据平台')).not.toBeInTheDocument();
    expect(screen.queryByText('为经营团队提供统一、可追溯的指标数据。')).not.toBeInTheDocument();
    expect(screen.queryByText('机密')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('受限内容')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('严格机密内容')).not.toBeInTheDocument();
    expect(screen.queryByText(/隐藏.*项目|项目.*隐藏/)).not.toBeInTheDocument();
  });

  it('redirects HR away from the project execution view it has no detail access to', () => {
    renderRoute('user-hr', '/projects');

    expect(screen.getByRole('heading', { name: '访问受限' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: '项目' })).not.toBeInTheDocument();
  });

  it('shows management the full Objective portfolio and the ability to create a new Objective', () => {
    renderRoute('user-management', '/okrs');

    expect(screen.getByRole('heading', { name: 'OKR 管理' })).toBeVisible();
    expect(screen.getByRole('button', { name: '新建 Objective' })).toBeEnabled();
    expect(screen.getByText('下一代光谱仪研发')).toBeVisible();
    expect(screen.getByText('AI智能检测平台')).toBeVisible();
  });

  it('shows a project leader only the Objectives they lead', () => {
    renderRoute('user-project-leader', '/okrs');

    expect(screen.getByText('AI智能检测平台')).toBeVisible();
    expect(screen.queryByText('下一代光谱仪研发')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '新建 Objective' })).not.toBeInTheDocument();
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
      renderRoute('user-project-leader', '/reports?tab=weekly');

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
