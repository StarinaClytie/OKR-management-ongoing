import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, AuthProvider, type AuthContextValue } from '../auth/AuthContext';
import type { OkrRepository } from '../data/types';
import type { Role } from '../domain/types';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { users } from '../mocks/users';
import { AppShell } from './AppShell';

function renderShell() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>
    </AuthProvider>,
  );
}

function renderSupabaseShell() {
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

  return render(
    <AuthContext.Provider value={auth}>
      <LocaleProvider repository={{ mode: 'supabase' } as OkrRepository}>
        <MemoryRouter>
          <AppShell />
        </MemoryRouter>
      </LocaleProvider>
    </AuthContext.Provider>,
  );
}

function renderShellAs(role: Role) {
  const currentUser = users.find((user) => user.role === role)!;
  const auth: AuthContextValue = {
    status: 'ready', mode: 'supabase', currentUser, selectableUsers: [], selectUser: vi.fn(), signOut: vi.fn(async () => undefined),
  };
  return render(
    <AuthContext.Provider value={auth}>
      <LocaleProvider repository={{ mode: 'supabase' } as OkrRepository}>
        <MemoryRouter><AppShell /></MemoryRouter>
      </LocaleProvider>
    </AuthContext.Provider>,
  );
}

function mockResponsiveViewport(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((media: string) => ({
    media,
    get matches() { return matches; },
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));

  return (nextMatches: boolean) => {
    matches = nextMatches;
    act(() => listeners.forEach((listener) => listener({ matches, media: '(max-width: 767px)' } as MediaQueryListEvent)));
  };
}

describe('application shell', () => {
  const sidebarStorageKey = 'time-tech-okr.sidebar-collapsed';

  beforeEach(() => window.localStorage.removeItem(sidebarStorageKey));

  afterEach(() => {
    window.localStorage.removeItem(sidebarStorageKey);
    vi.unstubAllGlobals();
  });

  it('starts with the desktop sidebar expanded when no preference is stored', () => {
    mockResponsiveViewport(false);
    renderShell();

    expect(screen.getByRole('button', { name: '收起侧边栏' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('complementary', { name: '主导航' })).not.toHaveClass('app-sidebar--collapsed');
  });

  it('persists a desktop collapse and restores it after remounting', async () => {
    mockResponsiveViewport(false);
    const user = userEvent.setup();
    const firstRender = renderShell();

    await user.click(screen.getByRole('button', { name: '收起侧边栏' }));

    expect(window.localStorage.getItem(sidebarStorageKey)).toBe('true');
    expect(screen.getByRole('button', { name: '展开侧边栏' })).toHaveAttribute('aria-expanded', 'false');

    firstRender.unmount();
    const secondRender = renderShell();

    expect(screen.getByRole('complementary', { name: '主导航' })).toHaveClass('app-sidebar--collapsed');
    expect(screen.getByRole('button', { name: '展开侧边栏' })).toHaveAttribute('aria-expanded', 'false');

    await user.click(screen.getByRole('button', { name: '展开侧边栏' }));
    expect(window.localStorage.getItem(sidebarStorageKey)).toBe('false');

    secondRender.unmount();
    renderShell();
    expect(screen.getByRole('button', { name: '收起侧边栏' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('falls back to an expanded desktop sidebar for invalid stored values', () => {
    window.localStorage.setItem(sidebarStorageKey, 'collapsed');
    mockResponsiveViewport(false);
    renderShell();

    expect(screen.getByRole('button', { name: '收起侧边栏' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('complementary', { name: '主导航' })).not.toHaveClass('app-sidebar--collapsed');
  });

  it('ignores the desktop collapse preference in the mobile drawer', async () => {
    window.localStorage.setItem(sidebarStorageKey, 'true');
    mockResponsiveViewport(true);
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('button', { name: '打开导航' }));

    const drawer = screen.getByRole('dialog', { name: '移动端主导航' });
    expect(drawer).not.toHaveClass('app-sidebar--collapsed');
    expect(screen.queryByRole('button', { name: '展开侧边栏' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '仪表盘' })).toHaveTextContent('仪表盘');
  });

  it('renders only the desktop sidebar above the mobile breakpoint', () => {
    mockResponsiveViewport(false);
    renderShell();

    expect(screen.getByRole('complementary', { name: '主导航' })).toBeVisible();
    expect(screen.queryByLabelText('移动端主导航')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '打开导航' })).not.toBeInTheDocument();
  });

  it.each(['employee', 'hr'] as const)('shows resource navigation to %s users', (role) => {
    mockResponsiveViewport(false);
    renderShellAs(role);

    expect(screen.getByRole('link', { name: '资源与耗材' })).toBeVisible();
  });

  it('switches to only the mobile sidebar when matchMedia crosses the breakpoint', () => {
    const setMobile = mockResponsiveViewport(false);
    renderShell();

    setMobile(true);

    expect(screen.queryByLabelText('主导航')).not.toBeInTheDocument();
    expect(screen.getByLabelText('移动端主导航')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: '打开导航' })).toBeVisible();
  });

  it('opens a modal drawer, focuses its close button, traps focus, and restores the menu focus', async () => {
    mockResponsiveViewport(true);
    const user = userEvent.setup();
    const { container } = renderShell();

    const menuButton = screen.getByRole('button', { name: '打开导航' });
    await user.click(menuButton);

    const drawer = screen.getByRole('dialog', { name: '移动端主导航' });
    const closeButton = screen.getByRole('button', { name: '关闭导航' });
    const background = container.querySelector('.app-shell__main');
    expect(drawer).toHaveAttribute('aria-modal', 'true');
    expect(closeButton).toHaveFocus();
    expect(background).toHaveAttribute('inert');
    expect(background).toHaveAttribute('aria-hidden', 'true');

    const lastDrawerAction = screen.getByRole('button', { name: '切换为英文' });
    lastDrawerAction.focus();
    await user.tab();
    expect(closeButton).toHaveFocus();
    await user.tab({ shift: true });
    expect(lastDrawerAction).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(menuButton).toHaveFocus();
    expect(screen.queryByRole('dialog', { name: '移动端主导航' })).not.toBeInTheDocument();
  });

  it('closes the mobile drawer and restores menu focus after account navigation', async () => {
    mockResponsiveViewport(true);
    const user = userEvent.setup();
    renderSupabaseShell();

    const menuButton = screen.getByRole('button', { name: '打开导航' });
    await user.click(menuButton);
    await user.click(screen.getByRole('button', { name: '打开账户菜单' }));
    await user.click(screen.getByRole('menuitem', { name: '个人资料' }));

    expect(screen.queryByRole('dialog', { name: '移动端主导航' })).not.toBeInTheDocument();
    expect(menuButton).toHaveFocus();
  });
});
