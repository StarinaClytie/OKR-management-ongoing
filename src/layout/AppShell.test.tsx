import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
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
  afterEach(() => vi.unstubAllGlobals());

  it('renders only the desktop sidebar above the mobile breakpoint', () => {
    mockResponsiveViewport(false);
    renderShell();

    expect(screen.getByRole('complementary', { name: '主导航' })).toBeVisible();
    expect(screen.queryByLabelText('移动端主导航')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '打开导航' })).not.toBeInTheDocument();
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

    const lastNavigationLink = screen.getByRole('link', { name: '设置' });
    lastNavigationLink.focus();
    await user.tab();
    expect(closeButton).toHaveFocus();
    await user.tab({ shift: true });
    expect(lastNavigationLink).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(menuButton).toHaveFocus();
    expect(screen.queryByRole('dialog', { name: '移动端主导航' })).not.toBeInTheDocument();
  });
});
