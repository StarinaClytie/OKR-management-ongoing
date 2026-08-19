import { useEffect, useState } from 'react';
import type { DashboardData } from '../data/types';
import type { OkrRepository, RepositoryErrorCode } from './types';

export type DashboardLoadState =
  | { status: 'loading'; data?: undefined; errorCode?: undefined }
  | { status: 'ready'; data: DashboardData; errorCode?: undefined }
  | { status: 'error'; data?: undefined; errorCode: RepositoryErrorCode };

type InternalState = DashboardLoadState & {
  repository: OkrRepository;
  userId: string | undefined;
};

function initialState(repository: OkrRepository, userId: string | undefined): InternalState {
  const cached = userId ? repository.getCachedDashboardData?.(userId) : undefined;
  return cached
    ? { repository, userId, status: 'ready', data: cached }
    : { repository, userId, status: 'loading' };
}

export function useDashboardData(repository: OkrRepository, userId: string | undefined): DashboardLoadState {
  const [state, setState] = useState<InternalState>(() => initialState(repository, userId));
  const matchesCurrentRequest = state.repository === repository && state.userId === userId;

  useEffect(() => {
    if (!userId) {
      setState({ repository, userId, status: 'loading' });
      return;
    }

    let active = true;
    const cached = repository.getCachedDashboardData?.(userId);
    setState(cached
      ? { repository, userId, status: 'ready', data: cached }
      : { repository, userId, status: 'loading' });

    void repository.getDashboardData(userId).then((result) => {
      if (!active) return;
      setState(result.ok
        ? { repository, userId, status: 'ready', data: result.data }
        : { repository, userId, status: 'error', errorCode: result.error.code });
    }).catch(() => {
      if (active) setState({ repository, userId, status: 'error', errorCode: 'network' });
    });

    return () => { active = false; };
  }, [repository, userId]);

  if (!matchesCurrentRequest) return { status: 'loading' };
  if (state.status === 'ready') return { status: 'ready', data: state.data };
  if (state.status === 'error') return { status: 'error', errorCode: state.errorCode };
  return { status: 'loading' };
}
