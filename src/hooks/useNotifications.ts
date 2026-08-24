import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { OkrRepository, RepositoryErrorCode } from '../data/types';
import type { NotificationPage, UserNotification } from '../domain/types';
import { repository } from '../lib/supabase';

export type NotificationRepository = Pick<OkrRepository, 'listMyNotifications' | 'markNotificationRead' | 'markAllNotificationsRead'>;

export interface NotificationState {
  items: UserNotification[];
  unreadCount: number;
  loading: boolean;
  hasMore: boolean;
  error?: RepositoryErrorCode;
  refresh(): Promise<void>;
  loadMore(): Promise<void>;
  markRead(id: string): Promise<boolean>;
  markAllRead(): Promise<boolean>;
}

export function useNotifications(dataRepository: NotificationRepository = repository): NotificationState {
  const { currentUser } = useAuth();
  const userId = currentUser?.id;
  const [items, setItems] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<NotificationPage['nextCursor']>(null);
  const [error, setError] = useState<RepositoryErrorCode>();
  const [stateUserId, setStateUserId] = useState(userId);
  const itemsRef = useRef<UserNotification[]>([]);
  const accountGeneration = useRef(0);
  const requestSequence = useRef(0);

  const load = useCallback(async (generation: number, requestUserId: string) => {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    setLoading(true);
    setError(undefined);
    const result = await dataRepository.listMyNotifications();
    if (accountGeneration.current !== generation || userId !== requestUserId || requestSequence.current !== requestId) return;
    setLoading(false);
    if (!result.ok) {
      setError(result.error.code);
      return;
    }
    const nextItems = [...result.data.items].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    itemsRef.current = nextItems;
    setStateUserId(requestUserId);
    setItems(nextItems);
    setUnreadCount(result.data.unreadCount);
    setNextCursor(result.data.nextCursor);
  }, [dataRepository, userId]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    await load(accountGeneration.current, userId);
  }, [load, userId]);

  const loadMore = useCallback(async () => {
    if (!userId || !nextCursor || loading) return;
    const generation = accountGeneration.current;
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    setLoading(true);
    setError(undefined);
    const result = await dataRepository.listMyNotifications(20, nextCursor);
    if (accountGeneration.current !== generation || requestSequence.current !== requestId) return;
    setLoading(false);
    if (!result.ok) {
      setError(result.error.code);
      return;
    }
    const byId = new Map(itemsRef.current.map((item) => [item.id, item]));
    result.data.items.forEach((item) => byId.set(item.id, item));
    const nextItems = [...byId.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    itemsRef.current = nextItems;
    setItems(nextItems);
    setUnreadCount(result.data.unreadCount);
    setNextCursor(result.data.nextCursor);
  }, [dataRepository, loading, nextCursor, userId]);

  useEffect(() => {
    accountGeneration.current += 1;
    const generation = accountGeneration.current;
    requestSequence.current += 1;
    itemsRef.current = [];
    setStateUserId(userId);
    setItems([]);
    setUnreadCount(0);
    setNextCursor(null);
    setError(undefined);
    setLoading(Boolean(userId));
    if (userId) void load(generation, userId);
  }, [load, userId]);

  const markRead = useCallback(async (id: string) => {
    if (!userId) return false;
    const generation = accountGeneration.current;
    setError(undefined);
    const result = await dataRepository.markNotificationRead(id);
    if (accountGeneration.current !== generation) return false;
    if (!result.ok) {
      setError(result.error.code);
      return false;
    }
    requestSequence.current += 1;
    setLoading(false);
    const wasUnread = itemsRef.current.some((item) => item.id === id && item.readAt === null);
    const nextItems = itemsRef.current.map((item) => item.id === id && item.readAt === null
      ? { ...item, readAt: new Date().toISOString() }
      : item);
    itemsRef.current = nextItems;
    setItems(nextItems);
    if (wasUnread) setUnreadCount((current) => Math.max(0, current - 1));
    return true;
  }, [dataRepository, userId]);

  const markAllRead = useCallback(async () => {
    if (!userId) return false;
    const generation = accountGeneration.current;
    setError(undefined);
    const result = await dataRepository.markAllNotificationsRead();
    if (accountGeneration.current !== generation) return false;
    if (!result.ok) {
      setError(result.error.code);
      return false;
    }
    requestSequence.current += 1;
    setLoading(false);
    const readAt = new Date().toISOString();
    const nextItems = itemsRef.current.map((item) => item.readAt === null ? { ...item, readAt } : item);
    itemsRef.current = nextItems;
    setItems(nextItems);
    setUnreadCount(0);
    return true;
  }, [dataRepository, userId]);

  const stateBelongsToCurrentUser = stateUserId === userId;
  return {
    items: stateBelongsToCurrentUser ? items : [],
    unreadCount: stateBelongsToCurrentUser ? unreadCount : 0,
    loading: stateBelongsToCurrentUser ? loading : Boolean(userId),
    hasMore: stateBelongsToCurrentUser && nextCursor !== null,
    error: stateBelongsToCurrentUser ? error : undefined,
    refresh,
    loadMore,
    markRead,
    markAllRead,
  };
}
