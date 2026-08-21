import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import { DailyReportsPage } from './DailyReportsPage';

function UserControls() {
  const { selectUser } = useAuth();
  return <button type="button" onClick={() => selectUser('user-management')}>切换为管理层</button>;
}

describe('DailyReportsPage user changes', () => {
  it('clears authoring and unsaved local reports when the simulated user changes', async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider initialUserId="user-employee">
        <UserControls />
        <MemoryRouter>
          <DailyReportsPage />
        </MemoryRouter>
      </AuthProvider>,
    );

    await user.click(screen.getByRole('button', { name: '填写今日日报' }));
    await user.selectOptions(screen.getByLabelText(/关联季度 KR/), 'kr-orion-onboarding');
    await user.type(screen.getByLabelText(/当日 O/), '只属于原用户的本地日报');
    await user.type(screen.getByLabelText(/工作描述/), '完成可验证的结果');
    await user.type(screen.getByLabelText(/结果/), '完成并记录数据');
    await user.type(screen.getByLabelText(/记录工时/), '2');
    await user.click(screen.getByRole('button', { name: '提交日报' }));
    expect(screen.getByText(/只属于原用户的本地日报/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: '切换为管理层' }));

    expect(screen.queryByText(/只属于原用户的本地日报/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/当日 O/)).not.toBeInTheDocument();
  });
});
