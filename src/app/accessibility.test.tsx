import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { AppRoutes } from './routes';

function renderAppAt(userId: string, path: string) {
  return render(
    <AuthProvider initialUserId={userId}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('application accessibility contracts', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('gives every visualization tab an accessible selected state', () => {
    renderAppAt('user-project-leader', '/dashboard');

    expect(screen.getByRole('tab', { name: '对齐树' })).toHaveAttribute('aria-selected', 'true');
  });

  it('has one primary Dashboard action for the employee role', () => {
    const { container } = renderAppAt('user-employee', '/dashboard');

    expect(container.querySelectorAll('.dashboard-page .button--primary')).toHaveLength(1);
    expect(within(screen.getByRole('region', { name: '今日重点' })).getByRole('button', { name: '填写今日日报' })).toHaveClass('button--primary');
  });

  it('offers a compact alignment summary with a details affordance', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    renderAppAt('user-project-leader', '/dashboard');

    expect(await screen.findByText('OKR 对齐摘要')).toBeVisible();
    expect(screen.getByText('查看详情')).toBeVisible();
  });

  it('returns focus to the menu after closing the mobile drawer from its scrim', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const user = userEvent.setup();
    const { container } = renderAppAt('user-employee', '/dashboard');

    const menuButton = screen.getByRole('button', { name: '打开导航' });
    await user.click(menuButton);
    await user.click(container.querySelector<HTMLButtonElement>('.sidebar-scrim')!);

    expect(menuButton).toHaveFocus();
    expect(screen.queryByRole('dialog', { name: '移动端主导航' })).not.toBeInTheDocument();
  });
});
