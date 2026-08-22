import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../app/App';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import type { OkrRepository } from '../data/types';
import { users } from '../mocks/users';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { Sidebar } from './Sidebar';
import '../styles/tokens.css';
import '../styles/global.css';

function renderDesktopSidebar(collapsed: boolean, onCollapsedChange = vi.fn()) {
  const currentUser = users.find((user) => user.id === 'user-administrator');
  const auth: AuthContextValue = {
    status: 'ready',
    mode: 'supabase',
    currentUser,
    email: 'admin@example.com',
    selectableUsers: [],
    selectUser: vi.fn(),
    signOut: vi.fn(async () => undefined),
  };

  render(
    <AuthContext.Provider value={auth}>
      <LocaleProvider repository={{ mode: 'supabase' } as OkrRepository}>
        <MemoryRouter>
          <Sidebar variant="desktop" collapsed={collapsed} onCollapsedChange={onCollapsedChange} onNavigate={vi.fn()} />
        </MemoryRouter>
      </LocaleProvider>
    </AuthContext.Provider>,
  );

  return { onCollapsedChange };
}

describe('application sidebar', () => {
  it('shows administrator system settings but not confidential business shortcuts', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.selectOptions(screen.getByLabelText('角色视图'), 'user-administrator');

    expect(screen.getByRole('link', { name: '设置' })).toBeVisible();
    expect(screen.queryByText('机密项目正文')).not.toBeInTheDocument();
  });

  it('places language and account utilities after desktop navigation when expanded', () => {
    renderDesktopSidebar(false);

    const sidebar = screen.getByRole('complementary', { name: '主导航' });
    const utilities = sidebar.querySelector('.app-sidebar__utilities');
    const navigation = sidebar.querySelector('nav');
    if (!utilities || !navigation) throw new Error('Expected navigation followed by sidebar utilities');

    expect(within(utilities as HTMLElement).getByRole('button', { name: '切换为英文' })).toBeVisible();
    expect(within(utilities as HTMLElement).getByRole('button', { name: '打开账户菜单' })).toBeVisible();
    expect(within(utilities as HTMLElement).getByText('管理员')).toBeVisible();
    expect(navigation.compareDocumentPosition(utilities) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps compact navigation and utilities accessible in the collapsed icon rail', async () => {
    const user = userEvent.setup();
    const { onCollapsedChange } = renderDesktopSidebar(true);

    const sidebar = screen.getByRole('complementary', { name: '主导航' });
    const dashboardLink = within(sidebar).getByRole('link', { name: '仪表盘' });
    const accountButton = within(sidebar).getByRole('button', { name: '打开账户菜单' });
    const languageButton = within(sidebar).getByRole('button', { name: '切换为英文' });
    const toggle = within(sidebar).getByRole('button', { name: '展开侧边栏' });

    expect(sidebar).toHaveClass('app-sidebar--collapsed');
    expect(within(dashboardLink).getByText('仪表盘')).toHaveClass('sr-only');
    expect(dashboardLink.querySelector('svg')).toBeInTheDocument();
    expect(accountButton.querySelector('.account-menu__avatar')).toBeInTheDocument();
    expect(languageButton.querySelector('svg')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);
    expect(onCollapsedChange).toHaveBeenCalledWith(false);
  });

  it('keeps bottom utilities reachable by scrolling navigation within a short desktop sidebar', () => {
    renderDesktopSidebar(false);

    const sidebar = screen.getByRole('complementary', { name: '主导航' });
    const navigation = within(sidebar).getByRole('navigation', { name: '工作区' });
    expect(window.getComputedStyle(navigation).overflowY).toBe('auto');
    expect(window.getComputedStyle(navigation).minHeight).toBe('0px');
  });
});
