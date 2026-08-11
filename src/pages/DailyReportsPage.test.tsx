import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { AppRoutes } from '../app/routes';

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
  it('lets the project leader begin their own daily report', () => {
    renderPageAs('user-project-leader');

    expect(screen.getByRole('button', { name: '填写今日日报' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '编辑我的日报' })).toBeEnabled();
  });

  it('offers review actions but not edit for a member report', () => {
    renderPageAs('user-project-leader');

    expect(screen.getByRole('button', { name: '确认成员日报' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '退回成员日报' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '添加评论' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '编辑成员日报' })).not.toBeInTheDocument();
  });

  it('lets an employee edit only their own report without project review actions', () => {
    renderPageAs('user-employee');

    expect(screen.getByRole('button', { name: '编辑我的日报' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '确认成员日报' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '添加评论' })).not.toBeInTheDocument();
  });

  it('keeps HR on an hours-only view without confidential report fields', () => {
    renderPageAs('user-hr');

    expect(screen.getByRole('table', { name: '授权工时日报' })).toBeVisible();
    expect(screen.getByRole('columnheader', { name: '工时' })).toBeVisible();
    expect(screen.queryByRole('columnheader', { name: '日报内容' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '证据' })).not.toBeInTheDocument();
    expect(screen.queryByText('完成引导文案的用户访谈整理，并提交实验配置。')).not.toBeInTheDocument();
    expect(screen.queryByText('用户访谈纪要')).not.toBeInTheDocument();
  });
});
