import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import type { RepositoryResult } from '../data/types';
import type { NotificationPage, User } from '../domain/types';
import { useNotifications, type NotificationRepository } from './useNotifications';

const firstUser: User = {
  id: 'user-1', name: '用户一', role: 'employee', clearance: 'internal', title: '工程师', department: '研发部', projectIds: [],
};
const secondUser: User = { ...firstUser, id: 'user-2', name: '用户二' };

const unreadPage: NotificationPage = {
  items: [
    { id: 'notification-1', type: 'daily_report_comment', reportId: 'report-1', resourceId: null, actorName: '主管', readAt: null, createdAt: '2026-08-24T10:00:00.000Z' },
    { id: 'notification-2', type: 'daily_report_confirmed', reportId: 'report-2', resourceId: null, actorName: '主管', readAt: '2026-08-24T09:30:00.000Z', createdAt: '2026-08-24T09:00:00.000Z' },
  ],
  nextCursor: null,
  unreadCount: 1,
};

function authValue(currentUser: User | undefined): AuthContextValue {
  return {
    status: currentUser ? 'ready' : 'signed_out',
    mode: 'supabase',
    currentUser,
    selectableUsers: [],
    selectUser: vi.fn(),
    signOut: vi.fn(async () => undefined),
  };
}

function wrapperFor(currentUser: User | undefined) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <AuthContext.Provider value={authValue(currentUser)}>{children}</AuthContext.Provider>;
  };
}

function notificationRepository(overrides: Partial<NotificationRepository> = {}): NotificationRepository {
  return {
    listMyNotifications: vi.fn(async () => ({ ok: true as const, data: unreadPage })),
    markNotificationRead: vi.fn(async () => ({ ok: true as const, data: undefined })),
    markAllNotificationsRead: vi.fn(async () => ({ ok: true as const, data: 1 })),
    ...overrides,
  };
}

describe('useNotifications', () => {
  it('loads the next notification page with the returned cursor and appends older items', async () => {
    const nextCursor = { createdAt: '2026-08-24T09:00:00.000Z', id: 'notification-2' };
    const olderItem = { id: 'notification-3', type: 'daily_report_comment' as const, reportId: 'report-3', resourceId: null, actorName: '主管', readAt: null, createdAt: '2026-08-23T10:00:00.000Z' };
    const repository = notificationRepository({
      listMyNotifications: vi.fn()
        .mockResolvedValueOnce({ ok: true, data: { ...unreadPage, nextCursor } })
        .mockResolvedValueOnce({ ok: true, data: { items: [olderItem], unreadCount: 2, nextCursor: null } }),
    });
    const { result } = renderHook(() => useNotifications(repository), { wrapper: wrapperFor(firstUser) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.loadMore(); });

    expect(repository.listMyNotifications).toHaveBeenNthCalledWith(2, 20, nextCursor);
    expect(result.current.items.map((item) => item.id)).toEqual(['notification-1', 'notification-2', 'notification-3']);
    expect(result.current.hasMore).toBe(false);
  });

  it('refreshes once when a user signs in and does not poll', async () => {
    vi.useFakeTimers();
    const repository = notificationRepository();
    const { result } = renderHook(() => useNotifications(repository), { wrapper: wrapperFor(firstUser) });

    await act(async () => { await vi.runAllTimersAsync(); });

    expect(result.current.items).toEqual(unreadPage.items);
    expect(result.current.unreadCount).toBe(1);
    expect(repository.listMyNotifications).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
    expect(repository.listMyNotifications).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('clears the previous account immediately and ignores its late refresh result', async () => {
    let resolveOldRefresh!: (result: RepositoryResult<NotificationPage>) => void;
    const oldRefresh = new Promise<RepositoryResult<NotificationPage>>((resolve) => { resolveOldRefresh = resolve; });
    const repository = notificationRepository({
      listMyNotifications: vi.fn()
        .mockResolvedValueOnce({ ok: true, data: unreadPage })
        .mockImplementationOnce(() => oldRefresh)
        .mockResolvedValueOnce({ ok: true, data: { items: [], unreadCount: 0, nextCursor: null } }),
    });
    let switchCurrentUser!: (user: User) => void;
    function SwitchingWrapper({ children }: PropsWithChildren) {
      const [currentUser, setCurrentUser] = useState(firstUser);
      switchCurrentUser = setCurrentUser;
      return <AuthContext.Provider value={authValue(currentUser)}>{children}</AuthContext.Provider>;
    }
    const { result } = renderHook(() => useNotifications(repository), { wrapper: SwitchingWrapper });
    await waitFor(() => expect(result.current.items).toEqual(unreadPage.items));

    void result.current.refresh();
    act(() => switchCurrentUser(secondUser));
    expect(result.current.items).toEqual([]);
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { resolveOldRefresh({ ok: true, data: unreadPage }); });
    expect(result.current.items).toEqual([]);
  });

  it('marks one notification locally only after the repository succeeds', async () => {
    const repository = notificationRepository();
    const { result } = renderHook(() => useNotifications(repository), { wrapper: wrapperFor(firstUser) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let success = false;
    await act(async () => { success = await result.current.markRead('notification-1'); });

    expect(success).toBe(true);
    expect(result.current.items[0].readAt).not.toBeNull();
    expect(result.current.unreadCount).toBe(0);
  });

  it('preserves unread state and exposes the error when marking one notification fails', async () => {
    const repository = notificationRepository({
      markNotificationRead: vi.fn(async () => ({ ok: false as const, error: { code: 'network' as const, message: 'offline' } })),
    });
    const { result } = renderHook(() => useNotifications(repository), { wrapper: wrapperFor(firstUser) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let success = true;
    await act(async () => { success = await result.current.markRead('notification-1'); });

    expect(success).toBe(false);
    expect(result.current.items[0].readAt).toBeNull();
    expect(result.current.unreadCount).toBe(1);
    expect(result.current.error).toBe('network');
  });

  it('marks all notifications locally only after the repository succeeds', async () => {
    const repository = notificationRepository();
    const { result } = renderHook(() => useNotifications(repository), { wrapper: wrapperFor(firstUser) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let success = false;
    await act(async () => { success = await result.current.markAllRead(); });

    expect(success).toBe(true);
    expect(result.current.items.every((item) => item.readAt !== null)).toBe(true);
    expect(result.current.unreadCount).toBe(0);
  });

  it('does not let a pre-mutation refresh resurrect a notification after markRead', async () => {
    let resolveRefresh!: (result: RepositoryResult<NotificationPage>) => void;
    const staleRefresh = new Promise<RepositoryResult<NotificationPage>>((resolve) => { resolveRefresh = resolve; });
    const repository = notificationRepository({
      listMyNotifications: vi.fn()
        .mockResolvedValueOnce({ ok: true, data: unreadPage })
        .mockImplementationOnce(() => staleRefresh),
    });
    const { result } = renderHook(() => useNotifications(repository), { wrapper: wrapperFor(firstUser) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let refreshPromise!: Promise<void>;
    act(() => { refreshPromise = result.current.refresh(); });
    await act(async () => { await result.current.markRead('notification-1'); });
    expect(result.current.unreadCount).toBe(0);

    await act(async () => {
      resolveRefresh({ ok: true, data: unreadPage });
      await refreshPromise;
    });
    expect(result.current.items[0].readAt).not.toBeNull();
    expect(result.current.unreadCount).toBe(0);
  });

  it('does not let a pre-mutation refresh resurrect unread state after markAllRead', async () => {
    let resolveRefresh!: (result: RepositoryResult<NotificationPage>) => void;
    const staleRefresh = new Promise<RepositoryResult<NotificationPage>>((resolve) => { resolveRefresh = resolve; });
    const repository = notificationRepository({
      listMyNotifications: vi.fn()
        .mockResolvedValueOnce({ ok: true, data: unreadPage })
        .mockImplementationOnce(() => staleRefresh),
    });
    const { result } = renderHook(() => useNotifications(repository), { wrapper: wrapperFor(firstUser) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let refreshPromise!: Promise<void>;
    act(() => { refreshPromise = result.current.refresh(); });
    await act(async () => { await result.current.markAllRead(); });
    expect(result.current.unreadCount).toBe(0);

    await act(async () => {
      resolveRefresh({ ok: true, data: unreadPage });
      await refreshPromise;
    });
    expect(result.current.items.every((item) => item.readAt !== null)).toBe(true);
    expect(result.current.unreadCount).toBe(0);
  });
});
