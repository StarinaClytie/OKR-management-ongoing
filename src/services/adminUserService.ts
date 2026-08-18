import type { RepositoryResult, SupabaseClientLike } from '../data/types';
import type { Role } from '../domain/types';

export interface PendingUser {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
}

export interface MemberOnboardingState {
  id: string;
  onboardingCompleted: boolean;
}

export interface AdminUsersOverview {
  pendingUsers: PendingUser[];
  onboardingStates: MemberOnboardingState[];
}

export interface InviteUserInput {
  email: string;
  displayName: string;
  department: string;
  jobTitle: string;
  role: Role;
}

export type InviteUserOutcome = 'invited' | 'recovered' | 'already_member';
export type InviteUserErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'invalid_email'
  | 'rate_limited'
  | 'email_not_authorized'
  | 'email_delivery_failed'
  | 'provisioning_failed'
  | 'recovery_invite_failed'
  | 'network';

export type InviteUserResult =
  | { ok: true; outcome: InviteUserOutcome; userId?: string; email: string; invitationSent: boolean }
  | { ok: false; error: { code: InviteUserErrorCode; message: string } };

export type ResendInvitationOutcome = 'resent' | 'already_completed';
export type ResendInvitationErrorCode = 'unauthorized' | 'forbidden' | 'resend_failed' | 'network';

export type ResendInvitationResult =
  | { ok: true; outcome: ResendInvitationOutcome; userId: string; email: string; invitationSent: boolean }
  | { ok: false; error: { code: ResendInvitationErrorCode; message: string } };

export type DeleteUserOutcome = 'deleted';
export type DeleteUserErrorCode = 'unauthorized' | 'forbidden' | 'self_delete' | 'network';

export type DeleteUserResult =
  | { ok: true; outcome: DeleteUserOutcome; userId: string; recordsPreserved: boolean }
  | { ok: false; error: { code: DeleteUserErrorCode; message: string } };

interface AdminUsersResponse {
  ok: boolean;
  code?: 'unauthorized' | 'forbidden' | 'network';
  pendingUsers?: PendingUser[];
  onboardingStates?: MemberOnboardingState[];
}

interface AdminInviteUserResponse {
  ok: boolean;
  outcome?: InviteUserOutcome;
  code?: InviteUserErrorCode;
  userId?: string;
  email?: string;
  invitationSent?: boolean;
}

interface AdminResendInviteResponse {
  ok: boolean;
  outcome?: ResendInvitationOutcome;
  code?: ResendInvitationErrorCode;
  userId?: string;
  email?: string;
  invitationSent?: boolean;
}

interface AdminDeleteUserResponse {
  ok: boolean;
  outcome?: DeleteUserOutcome;
  code?: DeleteUserErrorCode;
  userId?: string;
  recordsPreserved?: boolean;
}

const NETWORK_ERROR = { code: 'network', message: '请求未完成，请稍后重试' } as const;
const UNAUTHORIZED_ERROR = { code: 'unauthorized', message: '无权访问请求的资源' } as const;

function isForbiddenOrUnauthorized(code: unknown): boolean {
  return code === 'unauthorized' || code === 'forbidden';
}

export class AdminUserService {
  constructor(private readonly client: SupabaseClientLike) {}

  async listAdminUsers(): Promise<RepositoryResult<AdminUsersOverview>> {
    const invoke = this.client.functions;
    if (!invoke) return { ok: false, error: NETWORK_ERROR };

    try {
      const { data, error } = await invoke.invoke('admin-users');
      if (error) {
        return { ok: false, error: NETWORK_ERROR };
      }

      const response = data as AdminUsersResponse | null;
      if (!response || response.ok !== true) {
        const code = response?.code;
        return { ok: false, error: isForbiddenOrUnauthorized(code) ? UNAUTHORIZED_ERROR : NETWORK_ERROR };
      }

      return { ok: true, data: { pendingUsers: response.pendingUsers ?? [], onboardingStates: response.onboardingStates ?? [] } };
    } catch {
      return { ok: false, error: NETWORK_ERROR };
    }
  }

  async listPendingUsers(): Promise<RepositoryResult<PendingUser[]>> {
    const result = await this.listAdminUsers();
    return result.ok ? { ok: true, data: result.data.pendingUsers } : result;
  }

  async inviteUser(input: InviteUserInput): Promise<InviteUserResult> {
    const invoke = this.client.functions;
    if (!invoke) {
      return { ok: false, error: NETWORK_ERROR };
    }

    try {
      const { data, error } = await invoke.invoke('admin-invite-user', { body: input });
      if (error) {
        return { ok: false, error: NETWORK_ERROR };
      }

      const response = data as AdminInviteUserResponse | null;
      if (!response || response.ok !== true) {
        const code = response?.code;
        const normalized: InviteUserErrorCode =
          code === 'unauthorized' || code === 'forbidden' ? 'unauthorized'
            : code === 'invalid_email' ? 'invalid_email'
              : code === 'rate_limited' ? 'rate_limited'
                : code === 'email_not_authorized' ? 'email_not_authorized'
                  : code === 'email_delivery_failed' ? 'email_delivery_failed'
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
      return { ok: false, error: NETWORK_ERROR };
    }
  }

  async resendInvitation(userId: string): Promise<ResendInvitationResult> {
    const invoke = this.client.functions;
    if (!invoke) {
      return { ok: false, error: NETWORK_ERROR };
    }

    try {
      const { data, error } = await invoke.invoke('admin-resend-invite', { body: { userId } });
      if (error) {
        return { ok: false, error: NETWORK_ERROR };
      }

      const response = data as AdminResendInviteResponse | null;
      if (!response || response.ok !== true) {
        const code = response?.code;
        const normalized: ResendInvitationErrorCode =
          code === 'unauthorized' || code === 'forbidden' ? 'unauthorized'
            : code === 'resend_failed' ? 'resend_failed'
              : 'network';
        return { ok: false, error: { code: normalized, message: normalized === 'unauthorized' ? '无权访问请求的资源' : '请求未完成，请稍后重试' } };
      }

      return {
        ok: true,
        outcome: response.outcome === 'already_completed' ? 'already_completed' : 'resent',
        userId: response.userId ?? userId,
        email: response.email ?? '',
        invitationSent: response.invitationSent === true,
      };
    } catch {
      return { ok: false, error: NETWORK_ERROR };
    }
  }

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
