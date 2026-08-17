import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import type { OkrRepository, OrganizationUser, RepositoryResult } from '../data/types';
import type { User } from '../domain/types';
import { LocaleProvider } from '../i18n/LocaleProvider';
import type { AdminUserService, InviteUserResult, PendingUser } from '../services/adminUserService';
import { UsersPage } from './UsersPage';

const admin: User = { id: 'admin-1', name: '管理员', role: 'administrator', title: '', department: '', projectIds: [] };

const activeUsers: OrganizationUser[] = [
  { id: 'u1', displayName: '员工一', email: 'one@example.com', department: '产品部', jobTitle: '工程师', role: 'employee', isActive: true, projectIds: ['p1'] },
  { id: 'u2', displayName: '经理', email: 'mgr@example.com', department: '管理层', jobTitle: '总监', role: 'management', isActive: true, projectIds: [] },
];

const pendingUsers: PendingUser[] = [
  { id: 'pending-1', email: 'new@example.com', createdAt: '2026-08-01T00:00:00Z', lastSignInAt: null },
];

function makeRepository(overrides: Partial<OkrRepository> = {}): OkrRepository {
  return {
    mode: 'supabase',
    listOrganizationUsers: vi.fn(async () => ({ ok: true, data: activeUsers })),
    approvePendingUser: vi.fn(async () => ({ ok: true, data: undefined })),
    updateUserProfile: vi.fn(async () => ({ ok: true, data: undefined })),
    setUserActive: vi.fn(async () => ({ ok: true, data: undefined })),
    ...overrides,
  } as unknown as OkrRepository;
}

function makeAdminService(overrides: { listResult?: { ok: true; data: PendingUser[] }; inviteResult?: InviteUserResult } = {}): AdminUserService {
  return {
    listPendingUsers: vi.fn(async () => overrides.listResult ?? { ok: true, data: pendingUsers }),
    inviteUser: vi.fn(async (): Promise<InviteUserResult> => overrides.inviteResult ?? { ok: true, outcome: 'invited', email: 'new@example.com', invitationSent: true }),
  } as unknown as AdminUserService;
}

function renderUsersPage(opts: { role?: User['role']; repository?: OkrRepository; adminUsers?: AdminUserService } = {}) {
  const currentUser = { ...admin, role: opts.role ?? 'administrator' } as User;
  const value: AuthContextValue = { status: 'ready', mode: 'supabase', currentUser, selectableUsers: [], selectUser: vi.fn(), signOut: vi.fn() };
  const repository = opts.repository ?? makeRepository();
  const adminUsers = opts.adminUsers ?? makeAdminService();
  render(
    <AuthContext.Provider value={value}>
      <LocaleProvider repository={repository}>
        <MemoryRouter>
          <UsersPage dataRepository={repository} adminUsers={adminUsers} />
        </MemoryRouter>
      </LocaleProvider>
    </AuthContext.Provider>,
  );
  return { repository, adminUsers };
}

describe('UsersPage', () => {
  it('shows pending and active users to an administrator', async () => {
    renderUsersPage();

    expect(await screen.findByText('new@example.com')).toBeVisible();
    expect(screen.getByText('员工一')).toBeVisible();
    expect(screen.getByText('经理')).toBeVisible();
    expect(screen.getByRole('heading', { name: '待分配用户' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '已启用用户' })).toBeVisible();
  });

  it('denies an employee', () => {
    renderUsersPage({ role: 'employee' });
    expect(screen.getByRole('heading', { name: '访问受限' })).toBeVisible();
  });

  it('denies management', () => {
    renderUsersPage({ role: 'management' });
    expect(screen.getByRole('heading', { name: '访问受限' })).toBeVisible();
  });

  it('denies project_leader', () => {
    renderUsersPage({ role: 'project_leader' });
    expect(screen.getByRole('heading', { name: '访问受限' })).toBeVisible();
  });

  it('denies hr', () => {
    renderUsersPage({ role: 'hr' });
    expect(screen.getByRole('heading', { name: '访问受限' })).toBeVisible();
  });

  it('shows the Invite User button to an administrator', async () => {
    renderUsersPage();
    expect(await screen.findByRole('button', { name: '邀请用户' })).toBeVisible();
  });

  it('invites a user through the invite form', async () => {
    const user = userEvent.setup();
    const { adminUsers } = renderUsersPage();

    await screen.findByText('new@example.com');
    await user.click(screen.getByRole('button', { name: '邀请用户' }));

    expect(screen.getByRole('dialog', { name: '邀请用户' })).toBeVisible();
    await user.type(screen.getByLabelText('姓名 *'), '新同事');
    await user.type(screen.getByLabelText('邮箱 *'), 'colleague@example.com');
    await user.selectOptions(screen.getByLabelText('角色 *'), 'employee');
    await user.click(screen.getByRole('button', { name: '发送邀请' }));

    await waitFor(() => expect(adminUsers.inviteUser).toHaveBeenCalledWith({
      email: 'colleague@example.com',
      displayName: '新同事',
      department: '',
      jobTitle: '',
      role: 'employee',
    }));
  });

  it('rejects an invalid invite email', async () => {
    const user = userEvent.setup();
    const { adminUsers } = renderUsersPage();

    await screen.findByText('new@example.com');
    await user.click(screen.getByRole('button', { name: '邀请用户' }));
    await user.type(screen.getByLabelText('姓名 *'), '新同事');
    await user.type(screen.getByLabelText('邮箱 *'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: '发送邀请' }));

    expect(await screen.findByText('请输入有效的邮箱地址。')).toBeVisible();
    expect(adminUsers.inviteUser).not.toHaveBeenCalled();
  });

  it('shows a distinct message when the email already belongs to a member', async () => {
    const user = userEvent.setup();
    const adminUsers = makeAdminService({ inviteResult: { ok: true, outcome: 'already_member', email: 'colleague@example.com', invitationSent: false } });
    renderUsersPage({ adminUsers });

    await screen.findByText('new@example.com');
    await user.click(screen.getByRole('button', { name: '邀请用户' }));
    await user.type(screen.getByLabelText('姓名 *'), '新同事');
    await user.type(screen.getByLabelText('邮箱 *'), 'colleague@example.com');
    await user.click(screen.getByRole('button', { name: '发送邀请' }));

    expect(await screen.findByText('该邮箱已属于组织成员。')).toBeVisible();
  });

  it('shows the recovered message when no invitation was required', async () => {
    const user = userEvent.setup();
    const adminUsers = makeAdminService({ inviteResult: { ok: true, outcome: 'recovered', email: 'colleague@example.com', invitationSent: false } });
    renderUsersPage({ adminUsers });

    await screen.findByText('new@example.com');
    await user.click(screen.getByRole('button', { name: '邀请用户' }));
    await user.type(screen.getByLabelText('姓名 *'), '新同事');
    await user.type(screen.getByLabelText('邮箱 *'), 'colleague@example.com');
    await user.click(screen.getByRole('button', { name: '发送邀请' }));

    expect(await screen.findByText('账号已存在，组织权限已补全。')).toBeVisible();
  });

  it('shows the re-sent message when a recovered account had its invitation re-sent', async () => {
    const user = userEvent.setup();
    const adminUsers = makeAdminService({ inviteResult: { ok: true, outcome: 'recovered', email: 'colleague@example.com', invitationSent: true } });
    renderUsersPage({ adminUsers });

    await screen.findByText('new@example.com');
    await user.click(screen.getByRole('button', { name: '邀请用户' }));
    await user.type(screen.getByLabelText('姓名 *'), '新同事');
    await user.type(screen.getByLabelText('邮箱 *'), 'colleague@example.com');
    await user.click(screen.getByRole('button', { name: '发送邀请' }));

    expect(await screen.findByText('账号已存在，组织权限已补全，邀请已重新发送。')).toBeVisible();
  });

  it('shows an accurate error when a recovered account cannot be re-invited', async () => {
    const user = userEvent.setup();
    const adminUsers = makeAdminService({ inviteResult: { ok: false, error: { code: 'recovery_invite_failed', message: '请求未完成，请稍后重试' } } });
    renderUsersPage({ adminUsers });

    await screen.findByText('new@example.com');
    await user.click(screen.getByRole('button', { name: '邀请用户' }));
    await user.type(screen.getByLabelText('姓名 *'), '新同事');
    await user.type(screen.getByLabelText('邮箱 *'), 'colleague@example.com');
    await user.click(screen.getByRole('button', { name: '发送邀请' }));

    expect(await screen.findByText('账号权限已补全，但邀请邮件发送失败，请稍后重试。')).toBeVisible();
  });

  it('approves a pending user through the form', async () => {
    const user = userEvent.setup();
    const { repository } = renderUsersPage();

    await screen.findByText('new@example.com');
    await user.click(screen.getByRole('button', { name: '配置并批准' }));

    expect(screen.getByRole('dialog', { name: '配置并批准用户' })).toBeVisible();
    await user.type(screen.getByLabelText('姓名 *'), '新员工');
    await user.selectOptions(screen.getByLabelText('角色 *'), 'employee');
    await user.click(screen.getByRole('button', { name: '批准并启用' }));

    await waitFor(() => expect(repository.approvePendingUser).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'pending-1',
      displayName: '新员工',
      role: 'employee',
    })));
  });

  it('edits a user role and display fields', async () => {
    const user = userEvent.setup();
    const { repository } = renderUsersPage();

    await screen.findByText('员工一');
    await user.click(screen.getAllByRole('button', { name: '编辑' })[0]);

    expect(screen.getByRole('dialog', { name: '编辑用户' })).toBeVisible();
    await user.clear(screen.getByLabelText('姓名 *'));
    await user.type(screen.getByLabelText('姓名 *'), '新名字');
    await user.selectOptions(screen.getByLabelText('角色 *'), 'management');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(repository.updateUserProfile).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1',
      displayName: '新名字',
      role: 'management',
    })));
  });

  it('deactivates a user without deleting them', async () => {
    const user = userEvent.setup();
    const { repository } = renderUsersPage();

    await screen.findByText('员工一');
    await user.click(screen.getAllByRole('button', { name: '停用' })[0]);

    await waitFor(() => expect(repository.setUserActive).toHaveBeenCalledWith('u1', false));
  });

  it('reactivates an inactive user', async () => {
    const user = userEvent.setup();
    const inactive: OrganizationUser = { ...activeUsers[0], id: 'u3', displayName: '停用用户', isActive: false };
    const repository = makeRepository({
      listOrganizationUsers: vi.fn(async (): Promise<RepositoryResult<OrganizationUser[]>> => ({ ok: true, data: [inactive] })),
    });
    renderUsersPage({ repository });

    await screen.findByText('停用用户');
    await user.click(screen.getByRole('button', { name: '启用' }));

    await waitFor(() => expect(repository.setUserActive).toHaveBeenCalledWith('u3', true));
  });
});
