import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
        <DailyReportsPage />
      </AuthProvider>,
    );

    await user.click(screen.getByRole('button', { name: '填写今日日报' }));
    await user.type(screen.getByLabelText('当日 O'), '只属于原用户的本地日报');
    await user.type(screen.getByLabelText('当日 O 完成度'), '60');
    await user.type(screen.getByLabelText('KR1'), '完成可验证的结果');
    await user.type(screen.getByLabelText('KR1 本日工时'), '2');
    await user.type(screen.getByLabelText('KR1 完成度'), '60');
    await user.type(screen.getByLabelText('KR1 目标值'), '10');
    await user.type(screen.getByLabelText('KR1 当前实际值'), '6');
    await user.type(screen.getByLabelText('KR1 工作说明'), '已完成验证');
    await user.click(screen.getByRole('button', { name: '提交日报' }));
    expect(screen.getByText('只属于原用户的本地日报')).toBeVisible();

    await user.click(screen.getByRole('button', { name: '切换为管理层' }));

    expect(screen.queryByText('只属于原用户的本地日报')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('当日 O')).not.toBeInTheDocument();
  });
});
