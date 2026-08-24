import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import type { OkrRepository } from '../data/types';
import type { User } from '../domain/types';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { AccountMenu } from './AccountMenu';
import { NotificationCenterContext, type NotificationCenterContextValue } from './NotificationCenter';

const admin: User = {
  id: 'admin-1',
  name: '陈安',
  role: 'administrator',
  clearance: 'internal',
  title: '系统管理员',
  department: '信息技术部',
  projectIds: [],
  organization: 'Acme',
};

function renderMenu(auth: Partial<AuthContextValue> = {}, compact = false, notificationCenter?: NotificationCenterContextValue) {
  const signOut = vi.fn(async () => undefined);
  const value: AuthContextValue = {
    status: 'ready',
    mode: 'supabase',
    currentUser: admin,
    email: 'admin@example.com',
    selectableUsers: [],
    selectUser: vi.fn(),
    signOut,
    ...auth,
  };
  render(
    <AuthContext.Provider value={value}>
      <LocaleProvider repository={{ mode: 'supabase' } as OkrRepository}>
        <MemoryRouter>
          {notificationCenter ? (
            <NotificationCenterContext.Provider value={notificationCenter}>
              <AccountMenu compact={compact} />
            </NotificationCenterContext.Provider>
          ) : <AccountMenu compact={compact} />}
        </MemoryRouter>
      </LocaleProvider>
    </AuthContext.Provider>,
  );
  return { signOut };
}

describe('AccountMenu', () => {
  function notificationCenter(unreadCount: number): NotificationCenterContextValue {
    return {
      notifications: {
        items: unreadCount > 0 ? [{ id: 'notification-1', type: 'daily_report_comment', reportId: 'report-1', resourceId: null, actorName: '主管', readAt: null, createdAt: '2026-08-24T10:00:00.000Z' }] : [],
        unreadCount,
        loading: false,
        refresh: vi.fn(async () => undefined),
        markRead: vi.fn(async () => true),
        markAllRead: vi.fn(async () => true),
      },
      openReportFromNotification: vi.fn(async () => undefined),
      openResourceFromNotification: vi.fn(),
    };
  }

  it('shows the signed-in identity with role, email, and organization', async () => {
    const user = userEvent.setup();
    renderMenu();

    expect(screen.getByText('陈安')).toBeVisible();
    expect(screen.getByText('管理员')).toBeVisible();

    await user.click(screen.getByRole('button', { name: '打开账户菜单' }));

    expect(screen.getByRole('menu', { name: '账户菜单' })).toBeVisible();
    expect(screen.getByText('admin@example.com')).toBeVisible();
    expect(screen.getByText('Acme')).toBeVisible();
    expect(screen.getByRole('menuitem', { name: '个人资料' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: '账户设置' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: '退出登录' })).toBeVisible();
  });

  it('calls signOut when the sign-out item is clicked', async () => {
    const user = userEvent.setup();
    const { signOut } = renderMenu();

    await user.click(screen.getByRole('button', { name: '打开账户菜单' }));
    await user.click(screen.getByRole('menuitem', { name: '退出登录' }));

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and restores focus to the trigger', async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = screen.getByRole('button', { name: '打开账户菜单' });
    await user.click(trigger);
    expect(screen.getByRole('menu')).toBeVisible();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('is keyboard reachable and exposes the menu through aria attributes', async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = screen.getByRole('button', { name: '打开账户菜单' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows only the avatar in compact presentation while retaining the accessible menu behavior', async () => {
    const user = userEvent.setup();
    renderMenu({}, true);

    const trigger = screen.getByRole('button', { name: '打开账户菜单' });
    expect(trigger).toHaveClass('account-menu__trigger--compact');
    expect(trigger.querySelector('.account-menu__avatar')).toHaveTextContent('陈');
    expect(screen.queryByText('陈安')).not.toBeInTheDocument();
    expect(screen.queryByText('管理员')).not.toBeInTheDocument();
    expect(trigger.querySelector('svg')).not.toBeInTheDocument();

    await user.click(trigger);
    expect(screen.getByRole('menu', { name: '账户菜单' })).toBeVisible();
    expect(screen.getByRole('menu', { name: '账户菜单' })).toHaveTextContent('陈安');
    expect(screen.getByRole('menu', { name: '账户菜单' })).toHaveTextContent('管理员');
  });

  it('does not show a red dot or unread count when there are no unread notifications', () => {
    renderMenu({}, false, notificationCenter(0));

    expect(screen.getByRole('button', { name: '打开账户菜单' })).toBeVisible();
    expect(document.querySelector('.account-menu__notification-dot')).not.toBeInTheDocument();
  });

  it('keeps the unread red dot visible in compact mode and exposes the count accessibly', async () => {
    const user = userEvent.setup();
    const center = notificationCenter(2);
    renderMenu({}, true, center);

    const trigger = screen.getByRole('button', { name: '打开账户菜单，2 条未读通知' });
    expect(trigger.querySelector('.account-menu__notification-dot')).toBeVisible();

    await user.click(trigger);
    expect(screen.getByRole('menuitem', { name: '消息通知 2' })).toBeVisible();
    expect(center.notifications.refresh).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('menuitem', { name: '消息通知 2' }));
    const dialog = await screen.findByRole('dialog', { name: '消息通知' });
    expect(dialog).toBeVisible();
    expect(dialog.closest('.account-menu')).toBeNull();
    expect(center.notifications.refresh).toHaveBeenCalledTimes(2);
  });
});
