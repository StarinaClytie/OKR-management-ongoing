import type { RepositoryResult, SupabaseClientLike } from '../data/types';

export interface PendingUser {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
}

interface AdminUsersResponse {
  ok: boolean;
  code?: 'unauthorized' | 'forbidden' | 'network';
  pendingUsers?: PendingUser[];
}

export class AdminUserService {
  constructor(private readonly client: SupabaseClientLike) {}

  async listPendingUsers(): Promise<RepositoryResult<PendingUser[]>> {
    const invoke = this.client.functions;
    if (!invoke) {
      return { ok: false, error: { code: 'network', message: '请求未完成，请稍后重试' } };
    }

    try {
      const { data, error } = await invoke.invoke('admin-users');
      if (error) {
        return { ok: false, error: { code: 'network', message: '请求未完成，请稍后重试' } };
      }

      const response = data as AdminUsersResponse | null;
      if (!response || response.ok !== true) {
        const code = response?.code === 'unauthorized' || response?.code === 'forbidden'
          ? 'unauthorized'
          : 'network';
        return { ok: false, error: { code, message: code === 'unauthorized' ? '无权访问请求的资源' : '请求未完成，请稍后重试' } };
      }

      return { ok: true, data: response.pendingUsers ?? [] };
    } catch {
      return { ok: false, error: { code: 'network', message: '请求未完成，请稍后重试' } };
    }
  }
}
