import type { SupabaseClientLike } from '../data/types';

export type DeleteUserOutcome = 'deleted';
export type DeleteUserErrorCode = 'unauthorized' | 'forbidden' | 'self_delete' | 'network';

export type DeleteUserResult =
  | { ok: true; outcome: DeleteUserOutcome; userId: string; recordsPreserved: boolean }
  | { ok: false; error: { code: DeleteUserErrorCode; message: string } };

interface AdminDeleteUserResponse {
  ok: boolean;
  outcome?: DeleteUserOutcome;
  code?: DeleteUserErrorCode;
  userId?: string;
  recordsPreserved?: boolean;
}

const NETWORK_ERROR = { code: 'network', message: '请求未完成，请稍后重试' } as const;

export class AdminUserService {
  constructor(private readonly client: SupabaseClientLike) {}

  async deleteUser(userId: string): Promise<DeleteUserResult> {
    const invoke = this.client.functions;
    if (!invoke) {
      return { ok: false, error: NETWORK_ERROR };
    }

    try {
      const { data, error } = await invoke.invoke('admin-delete-user', { body: { userId } });
      if (error) {
        return { ok: false, error: NETWORK_ERROR };
      }

      const response = data as AdminDeleteUserResponse | null;
      if (!response || response.ok !== true) {
        const code = response?.code;
        const normalized: DeleteUserErrorCode =
          code === 'unauthorized' || code === 'forbidden' ? 'unauthorized'
            : code === 'self_delete' ? 'self_delete'
              : 'network';
        return { ok: false, error: { code: normalized, message: normalized === 'unauthorized' ? '无权访问请求的资源' : normalized === 'self_delete' ? '不能删除当前登录的管理员账号' : '请求未完成，请稍后重试' } };
      }

      return {
        ok: true,
        outcome: 'deleted',
        userId: response.userId ?? userId,
        recordsPreserved: response.recordsPreserved === true,
      };
    } catch {
      return { ok: false, error: NETWORK_ERROR };
    }
  }
}
