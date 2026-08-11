import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { AppRoutes } from '../app/routes';

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
});
