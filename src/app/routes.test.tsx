import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { App } from './App';
import { AppRoutes } from './routes';

describe('application routes', () => {
  it('opens personal settings for an employee without exposing role-restricted settings', async () => {
    window.history.pushState({}, '', '/settings');

    render(<App />);

    expect(await screen.findByRole('heading', { name: '设置' })).toBeVisible();
    expect(screen.getByRole('tab', { name: '个人偏好' })).toBeVisible();
    expect(screen.queryByRole('tab', { name: '系统设置' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'HR 规则' })).not.toBeInTheDocument();
  });

  it('renders the real DashboardPage when the dashboard URL is opened directly', () => {
    render(
      <AuthProvider initialUserId="user-project-leader">
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(screen.getByRole('heading', { name: '项目执行概览' })).toBeVisible();
    expect(screen.getByRole('tablist', { name: '项目可视化视图' })).toBeVisible();
    expect(screen.queryByText('页面框架将在后续迭代中补充。')).not.toBeInTheDocument();
  });

  it('opens the real dashboard from the sidebar and switches all five project views', async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider initialUserId="user-project-leader">
        <MemoryRouter initialEntries={['/projects']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(screen.getByRole('heading', { name: '项目' })).toBeVisible();

    await user.click(screen.getByRole('link', { name: '仪表盘' }));

    expect(screen.getByRole('heading', { name: '项目执行概览' })).toBeVisible();
    for (const label of ['对齐树', '甘特图', '进度趋势', '风险矩阵', '工作负载']) {
      await user.click(screen.getByRole('tab', { name: label }));
      expect(screen.getByRole('tabpanel', { name: label })).toBeVisible();
    }
  });
});
