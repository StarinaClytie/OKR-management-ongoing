import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import type { OkrRepository } from '../data/types';
import type { NotificationPage, User } from '../domain/types';
import { useNotifications, type NotificationRepository } from '../hooks/useNotifications';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { NotificationCenter } from './NotificationCenter';

const currentUser: User = {
  id: 'user-1', name: '周琳', role: 'employee', clearance: 'internal', title: '工程师', department: '研发部', projectIds: [],
};

const page: NotificationPage = {
  items: [
    { id: 'notification-report', type: 'daily_report_comment', reportId: 'report-1', resourceId: null, actorName: '主管', readAt: null, createdAt: '2026-08-24T10:00:00.000Z' },
    { id: 'notification-resource', type: 'resource_owner_assigned', reportId: null, resourceId: 'resource-1', actorName: '管理员', readAt: null, createdAt: '2026-08-24T11:00:00.000Z' },
  ],
  nextCursor: null,
  unreadCount: 2,
};

function authValue(): AuthContextValue {
  return {
    status: 'ready', mode: 'supabase', currentUser, selectableUsers: [], selectUser: vi.fn(), signOut: vi.fn(async () => undefined),
  };
}

function createRepository(events: string[] = []): NotificationRepository {
  return {
    listMyNotifications: vi.fn(async () => ({ ok: true as const, data: page })),
    markNotificationRead: vi.fn(async (id) => {
      events.push(`mark:${id}`);
      return { ok: true as const, data: undefined };
    }),
    markAllNotificationsRead: vi.fn(async () => ({ ok: true as const, data: 2 })),
  };
}

function renderCenter(options: {
  repository?: NotificationRepository;
  openReport?: (reportId: string) => Promise<void>;
  openResource?: (resourceId: string) => void;
} = {}) {
  const repository = options.repository ?? createRepository();
  const openReport = options.openReport ?? vi.fn(async () => undefined);
  const openResource = options.openResource ?? vi.fn();
  let currentNotifications!: ReturnType<typeof useNotifications>;
  function Harness() {
    const notifications = useNotifications(repository);
    currentNotifications = notifications;
    return (
      <NotificationCenter
        notifications={notifications}
        onClose={vi.fn()}
        openReportFromNotification={openReport}
        openResourceFromNotification={openResource}
      />
    );
  }
  render(
    <AuthContext.Provider value={authValue()}>
      <LocaleProvider repository={{ mode: 'supabase' } as OkrRepository}>
        <MemoryRouter><Harness /></MemoryRouter>
      </LocaleProvider>
    </AuthContext.Provider>,
  );
  return { repository, openReport, openResource, getNotifications: () => currentNotifications };
}

describe('NotificationCenter', () => {
  it('offers and loads older notifications when another page exists', async () => {
    const user = userEvent.setup();
    const olderItem = { id: 'notification-older', type: 'daily_report_comment' as const, reportId: 'report-older', resourceId: null, actorName: '旧主管', readAt: null, createdAt: '2026-08-23T10:00:00.000Z' };
    const repository = createRepository();
    repository.listMyNotifications = vi.fn()
      .mockResolvedValueOnce({ ok: true, data: { ...page, nextCursor: { createdAt: '2026-08-24T10:00:00.000Z', id: 'notification-report' } } })
      .mockResolvedValueOnce({ ok: true, data: { items: [olderItem], unreadCount: 3, nextCursor: null } });
    renderCenter({ repository });

    await user.click(await screen.findByRole('button', { name: '加载更多通知' }));

    expect(await screen.findByRole('button', { name: '旧主管评论了日报' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '加载更多通知' })).not.toBeInTheDocument();
  });

  it('renders newest first in an accessible dialog', async () => {
    renderCenter();

    const dialog = await screen.findByRole('dialog', { name: '消息通知' });
    const items = screen.getAllByRole('listitem');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(items[0]).toHaveTextContent('管理员将你设为资源负责人');
    expect(items[1]).toHaveTextContent('主管评论了日报');
  });

  it('does not move focus back to Close when notification state rerenders', async () => {
    const { getNotifications } = renderCenter();
    const itemButton = await screen.findByRole('button', { name: '主管评论了日报' });
    itemButton.focus();

    await act(async () => { await getNotifications().refresh(); });

    expect(itemButton).toHaveFocus();
  });

  it('marks a single unread notification and updates the visible unread count', async () => {
    const user = userEvent.setup();
    renderCenter();
    await screen.findByText('2 条未读通知');

    await user.click(screen.getByRole('button', { name: '标为已读：主管评论了日报' }));

    await screen.findByText('1 条未读通知');
    expect(screen.queryByRole('button', { name: '标为已读：主管评论了日报' })).not.toBeInTheDocument();
  });

  it('marks every notification read', async () => {
    const user = userEvent.setup();
    renderCenter();
    await screen.findByText('2 条未读通知');

    await user.click(screen.getByRole('button', { name: '全部标为已读' }));

    await screen.findByText('没有未读通知');
    expect(screen.queryByRole('button', { name: /标为已读：/ })).not.toBeInTheDocument();
  });

  it('shows the repository error when marking a notification fails', async () => {
    const user = userEvent.setup();
    const repository = createRepository();
    repository.markNotificationRead = vi.fn(async () => ({ ok: false as const, error: { code: 'network' as const, message: 'offline' } }));
    renderCenter({ repository });
    await screen.findByText('主管评论了日报');

    await user.click(screen.getByRole('button', { name: '标为已读：主管评论了日报' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('网络错误，请检查连接后重试。');
    expect(screen.getByText('2 条未读通知')).toBeVisible();
  });

  it('marks a report notification before requesting its detail', async () => {
    const events: string[] = [];
    const repository = createRepository(events);
    const openReport = vi.fn(async (reportId: string) => { events.push(`open:${reportId}`); });
    const user = userEvent.setup();
    renderCenter({ repository, openReport });
    await screen.findByText('主管评论了日报');

    await user.click(screen.getByRole('button', { name: '主管评论了日报' }));

    expect(events).toEqual(['mark:notification-report', 'open:report-1']);
  });

  it('marks a resource assignment before opening the existing resource detail', async () => {
    const events: string[] = [];
    const repository = createRepository(events);
    const openResource = vi.fn((resourceId: string) => { events.push(`navigate:/resources/${resourceId}`); });
    const user = userEvent.setup();
    renderCenter({ repository, openResource });
    await screen.findByText('管理员将你设为资源负责人');

    await user.click(screen.getByRole('button', { name: '管理员将你设为资源负责人' }));

    await waitFor(() => expect(events).toEqual(['mark:notification-resource', 'navigate:/resources/resource-1']));
  });

  it('keeps an inaccessible report notification read and shows an error', async () => {
    const user = userEvent.setup();
    renderCenter({ openReport: vi.fn(async () => { throw new Error('denied'); }) });
    await screen.findByText('主管评论了日报');

    await user.click(screen.getByRole('button', { name: '主管评论了日报' }));

    expect(await screen.findByText('1 条未读通知')).toBeVisible();
    expect(screen.queryByRole('button', { name: '标为已读：主管评论了日报' })).not.toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('请求未完成，请稍后重试。');
  });
});
