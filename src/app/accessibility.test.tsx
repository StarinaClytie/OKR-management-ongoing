import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { AppRoutes } from './routes';

function renderAppAs(userId: string) {
  return render(
    <AuthProvider initialUserId={userId}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('application accessibility contracts', () => {
  it('gives every visualization tab an accessible selected state', () => {
    renderAppAs('user-project-leader');

    expect(screen.getByRole('tab', { name: '对齐树' })).toHaveAttribute('aria-selected', 'true');
  });

  it('has one primary Dashboard action for the employee role', () => {
    renderAppAs('user-employee');

    expect(screen.getAllByTestId('primary-action')).toHaveLength(1);
  });

  it('offers a compact alignment summary with a details affordance', async () => {
    renderAppAs('user-project-leader');

    expect(await screen.findByText('OKR 对齐摘要')).toBeVisible();
    expect(screen.getByText('查看详情')).toBeVisible();
  });

  it('returns focus to the menu after closing the mobile drawer from its scrim', async () => {
    const user = userEvent.setup();
    renderAppAs('user-employee');

    const menuButton = screen.getByRole('button', { name: '打开导航' });
    await user.click(menuButton);
    await user.click(screen.getByRole('button', { name: '关闭导航遮罩' }));

    expect(menuButton).toHaveFocus();
    expect(screen.getByLabelText('移动端主导航')).toHaveAttribute('aria-hidden', 'true');
  });
});
