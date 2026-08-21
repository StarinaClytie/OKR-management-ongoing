import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '../auth/AuthContext';
import { AppRoutes } from '../app/routes';

function renderPageAs(userId: string) {
  return render(
    <AuthProvider initialUserId={userId}>
      <MemoryRouter initialEntries={['/reports?tab=daily']}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('DailyReportsPage', () => {
  it('shows a clear fill-today CTA when the employee owns assigned KRs', () => {
    renderPageAs('user-employee');
    expect(screen.getByRole('button', { name: '填写今日日报' })).toBeEnabled();
  });

  it('lets an employee submit a Daily OKR entry with work, result, and hours', async () => {
    const user = userEvent.setup();
    renderPageAs('user-employee');

    await user.click(screen.getByRole('button', { name: '填写今日日报' }));
    await user.selectOptions(screen.getByLabelText(/关联季度 KR/), 'kr-orion-onboarding');
    await user.type(screen.getByLabelText(/当日 O/), '完成实验采集第一阶段');
    await user.type(screen.getByLabelText(/工作描述/), '完成样本 A 测量');
    await user.type(screen.getByLabelText(/结果/), '完成数据采集');
    await user.type(screen.getByLabelText(/记录工时/), '3.5');
    await user.click(screen.getByRole('button', { name: '提交日报' }));

    expect(screen.getByText('日报已保存。')).toBeVisible();
    expect(screen.getByText(/完成实验采集第一阶段/)).toBeVisible();
  });

  it('keeps management out of daily report authoring', () => {
    renderPageAs('user-management');
    expect(screen.queryByRole('button', { name: '填写今日日报' })).not.toBeInTheDocument();
  });

  it('keeps HR on an hours-only view without report bodies', () => {
    renderPageAs('user-hr');
    expect(screen.getByRole('table', { name: '授权工时日报' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '填写今日日报' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/当日 O/)).not.toBeInTheDocument();
  });
});
