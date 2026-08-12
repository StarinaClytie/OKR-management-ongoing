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

  it('does not leak an inaccessible project name in the project list', () => {
    renderRoute('user-employee', '/projects');

    expect(screen.getByRole('heading', { name: '项目' })).toBeVisible();
    expect(screen.queryByText('新星数据平台')).not.toBeInTheDocument();
    expect(screen.getByLabelText('受限内容')).toBeVisible();
  });

  it('gives a project leader their own KR update action only for an owned key result', () => {
    renderRoute('user-project-leader', '/okrs');

    expect(screen.getByRole('button', { name: '更新我的 KR' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '更新成员 KR' })).not.toBeInTheDocument();
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
