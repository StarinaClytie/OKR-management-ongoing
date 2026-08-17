import type { RepositoryResult, SupabaseClientLike } from '../data/types';
import type { Role } from '../domain/types';

export interface PendingUser {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
}

export interface InviteUserInput {
  email: string;
  displayName: string;
  department: string;
  jobTitle: string;
  role: Role;
}

export type InviteUserOutcome = 'invited' | 'recovered' | 'already_member';
export type InviteUserErrorCode = 'unauthorized' | 'forbidden' | 'invalid_email' | 'provisioning_failed' | 'recovery_invite_failed' | 'network';

export type InviteUserResult =
  | { ok: true; outcome: InviteUserOutcome; userId?: string; email: string; invitationSent: boolean }
  | { ok: false; error: { code: InviteUserErrorCode; message: string } };

interface AdminUsersResponse {
  ok: boolean;
  code?: 'unauthorized' | 'forbidden' | 'network';
  pendingUsers?: PendingUser[];
}

interface AdminInviteUserResponse {
  ok: boolean;
  outcome?: InviteUserOutcome;
  code?: InviteUserErrorCode;
  userId?: string;
  email?: string;
  invitationSent?: boolean;
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

  async inviteUser(input: InviteUserInput): Promise<InviteUserResult> {
    const invoke = this.client.functions;
    if (!invoke) {
      return { ok: false, error: { code: 'network', message: '请求未完成，请稍后重试' } };
    }

    try {
      const { data, error } = await invoke.invoke('admin-invite-user', { body: input });
      if (error) {
        return { ok: false, error: { code: 'network', message: '请求未完成，请稍后重试' } };
      }

      const response = data as AdminInviteUserResponse | null;
      if (!response || response.ok !== true) {
        const code = response?.code;
        const normalized: InviteUserErrorCode =
          code === 'unauthorized' || code === 'forbidden' ? 'unauthorized'
            : code === 'invalid_email' ? 'invalid_email'
              : code === 'provisioning_failed' ? 'provisioning_failed'
                : code === 'recovery_invite_failed' ? 'recovery_invite_failed'
                  : 'network';
        return { ok: false, error: { code: normalized, message: normalized === 'unauthorized' ? '无权访问请求的资源' : '请求未完成，请稍后重试' } };
      }

      const email = response.email ?? input.email;
      if (response.outcome === 'already_member') {
        return { ok: true, outcome: 'already_member', email, invitationSent: false };
      }
      const outcome: InviteUserOutcome = response.outcome === 'recovered' ? 'recovered' : 'invited';
      return { ok: true, outcome, userId: response.userId, email, invitationSent: response.invitationSent === true };
    } catch {
      return { ok: false, error: { code: 'network', message: '请求未完成，请稍后重试' } };
    }
  }
}
