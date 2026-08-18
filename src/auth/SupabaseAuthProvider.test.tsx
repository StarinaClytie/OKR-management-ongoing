import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RoleSwitcher } from '../layout/RoleSwitcher';
import type { AuthProfileState, OkrRepository, RepositoryResult, SessionLike, SupabaseClientLike } from '../data/types';
import type { User } from '../domain/types';
import { SupabaseAuthProvider } from './SupabaseAuthProvider';
import { useAuth } from './AuthContext';

const employee: User = {
  id: 'user-one',
  name: '员工一',
  role: 'employee',
  title: '工程师',
  department: '产品',
  projectIds: [],
};

const invitee: User = {
  id: 'invitee',
  name: '受邀人',
  role: 'employee',
  title: '',
  department: '',
  projectIds: [],
};

// The administrator may have edited the invitee's role after the invitation was
// sent but before the invitee accepted it. The application database is
// authoritative, so the resolved profile must carry the latest DB role.
const managementInvitee: User = {
  id: 'invitee',
  name: '受邀人',
  role: 'management',
  title: '',
  department: '',
  projectIds: [],
};

function StateProbe() {
  const auth = useAuth();
  return <output>{`${auth.status}:${auth.currentUser?.id ?? 'none'}:${auth.email ?? 'no-email'}`}</output>;
}

function RoleProbe() {
  const auth = useAuth();
  return <output>{`role:${auth.currentUser?.role ?? 'none'}`}</output>;
}

function SignOutProbe() {
  const { signOut } = useAuth();
  return <button onClick={() => void signOut()}>signout</button>;
}

interface CreateClientOptions {
  initializeError?: { message: string } | null;
  deferred?: boolean;
  callbackSession?: SessionLike | null;
}

// Models the gotrue client enough to exercise the invariant-based setup machine:
//   - `initialize()` resolves `{ error: null }` iff the URL callback succeeded;
//     a non-null error means the callback failed and any prior session was
//     preserved.
//   - `getSession()` returns, after a successful initialize, the callback
//     session (gotrue overwrote any prior stored session with the invitee);
//     after a failed initialize it returns the preserved prior session.
function createClient(initialSession: SessionLike | null, options: CreateClientOptions = {}) {
  const { initializeError = null, deferred = false, callbackSession } = options;
  let listener: ((event: string, session: SessionLike | null) => void) | undefined;
  let settleInitialize: ((value: { error: { message: string } | null }) => void) | undefined;
  const signInWithPassword = vi.fn(async (): Promise<{ data: { session: SessionLike | null }; error: { message: string } | null }> => ({ data: { session: null }, error: null }));
  const updateUser = vi.fn(async (): Promise<{ data: { user: SessionLike['user'] | null }; error: { message: string } | null }> => ({ data: { user: null }, error: null }));
  const rpc = vi.fn(async (): Promise<{ data: unknown; error: { message: string } | null }> => ({ data: null, error: null }));
  const initialize = deferred
    ? vi.fn(() => new Promise<{ error: { message: string } | null }>((resolve) => { settleInitialize = resolve; }))
    : vi.fn(async () => ({ error: initializeError }));
  const getSession = vi.fn(async () => ({
    data: { session: initializeError ? initialSession : (callbackSession ?? initialSession) },
    error: null,
  }));
  const onAuthStateChange = vi.fn((callback: (event: string, session: SessionLike | null) => void) => {
    listener = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  const client: SupabaseClientLike = {
    auth: {
      initialize,
      getSession,
      onAuthStateChange,
      signInWithPassword,
      updateUser,
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: vi.fn() as never,
    rpc: rpc as never,
    storage: {} as never,
  };
  return {
    client,
    signInWithPassword,
    updateUser,
    rpc,
    initialize,
    getSession,
    onAuthStateChange,
    settleInitialize: () => settleInitialize?.({ error: initializeError }),
    emit: (session: SessionLike | null, event = 'SIGNED_IN') => listener?.(event, session),
  };
}

function repositoryWithProfile(result: RepositoryResult<AuthProfileState>): OkrRepository {
  return {
    mode: 'supabase',
    getCurrentProfile: vi.fn(async () => result),
  } as unknown as OkrRepository;
}

const active = { ok: true as const, data: { kind: 'active' as const, user: employee } };
const inviteeActive = { ok: true as const, data: { kind: 'active' as const, user: invitee } };
const managementInviteeActive = { ok: true as const, data: { kind: 'active' as const, user: managementInvitee } };
const inactiveState = { ok: true as const, data: { kind: 'inactive' as const } };
const unassignedState = { ok: true as const, data: { kind: 'unassigned' as const } };

const administrator: User = {
  id: 'admin',
  name: '管理员',
  role: 'administrator',
  title: '',
  department: '',
  projectIds: [],
};
const adminActive = { ok: true as const, data: { kind: 'active' as const, user: administrator } };

const inviteeSession: SessionLike = {
  user: { id: 'invitee', email: 'invitee@example.com', email_confirmed_at: '2026-08-17T00:00:00Z' },
};
const adminSession: SessionLike = {
  user: { id: 'admin', email: 'admin@example.com', email_confirmed_at: '2026-08-17T00:00:00Z' },
};

// A genuine implicit invite callback: the complete token set gotrue requires
// (access_token, refresh_token, expires_in, token_type) plus type=invite.
function setInviteLocation() {
  window.history.pushState({}, '', '/auth/invite#access_token=abc&expires_in=3600&refresh_token=ref&token_type=bearer&type=invite');
}

// A genuine implicit recovery callback: the same complete token set plus
// type=recovery, produced by `resetPasswordForEmail` for a confirmed-but-
// incomplete user. It must reach the same password-setup form as invite.
function setRecoveryLocation() {
  window.history.pushState({}, '', '/auth/invite#access_token=abc&expires_in=3600&refresh_token=ref&token_type=bearer&type=recovery');
}

// A forged/incomplete implicit callback: only an access_token, missing the rest.
function setIncompleteCallbackLocation() {
  window.history.pushState({}, '', '/auth/invite#access_token=fake');
}

// A PKCE-style code with no verifier — not a callback this app recognizes.
function setForgedCodeLocation() {
  window.history.pushState({}, '', '/auth/invite?code=fake');
}

describe('SupabaseAuthProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  it('renders signed-out state without demo identity', async () => {
    const { client } = createClient(null);
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(active)}><StateProbe /></SupabaseAuthProvider>);
    expect(await screen.findByRole('heading', { name: '登录 Northstar OKR' })).toBeVisible();
  });

  it('renders assignment-pending when authenticated identity has no profile', async () => {
    const { client } = createClient({ user: { id: 'unassigned' } });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(unassignedState)}><StateProbe /></SupabaseAuthProvider>);
    expect(await screen.findByRole('heading', { name: '等待管理员分配' })).toBeVisible();
  });

  it('renders the deactivated-account message for an inactive profile', async () => {
    const { client } = createClient({ user: { id: 'user-one', email: 'one@example.com' } });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(inactiveState)}><StateProbe /></SupabaseAuthProvider>);
    expect(await screen.findByRole('heading', { name: '账户已停用' })).toBeVisible();
  });

  it('surfaces the session email for an active user', async () => {
    const { client } = createClient({ user: { id: 'user-one', email: 'one@example.com' } });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(active)}><StateProbe /></SupabaseAuthProvider>);
    expect(await screen.findByText('ready:user-one:one@example.com')).toBeVisible();
  });

  it('uses the stored locale and allows switching on signed-out screens', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('northstar.locale', 'en');
    const { client } = createClient(null);

    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(active)}><StateProbe /></SupabaseAuthProvider>);

    expect(await screen.findByRole('heading', { name: 'Sign in to Northstar OKR' })).toBeVisible();
    expect(document.documentElement.lang).toBe('en');
    await user.click(screen.getByRole('button', { name: 'Switch to Chinese' }));
    expect(screen.getByRole('heading', { name: '登录 Northstar OKR' })).toBeVisible();
    expect(document.documentElement.lang).toBe('zh-CN');
  });

  it('clears the previous user synchronously before loading a changed session', async () => {
    let resolveSecond: ((value: RepositoryResult<AuthProfileState>) => void) | undefined;
    const repository = repositoryWithProfile(active);
    vi.mocked(repository.getCurrentProfile)
      .mockResolvedValueOnce(active)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    const { client, emit } = createClient({ user: { id: 'user-one' } });
    render(<SupabaseAuthProvider client={client} repository={repository}><StateProbe /></SupabaseAuthProvider>);
    expect(await screen.findByText('ready:user-one:no-email')).toBeVisible();

    act(() => emit({ user: { id: 'user-two' } }));
    expect(screen.getByRole('heading', { name: '正在验证身份' })).toBeVisible();

    await act(async () => resolveSecond?.({ ok: true, data: { kind: 'active', user: { ...employee, id: 'user-two' } } }));
    await waitFor(() => expect(screen.getByText('ready:user-two:no-email')).toBeVisible());
  });

  it('never renders the demo role switcher in Supabase mode', async () => {
    const { client } = createClient({ user: { id: 'user-one' } });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(active)}><RoleSwitcher /></SupabaseAuthProvider>);
    await waitFor(() => expect(screen.queryByLabelText('演示角色')).not.toBeInTheDocument());
  });

  it('renders the email/password login form when signed out', async () => {
    const { client } = createClient(null);
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(active)}><StateProbe /></SupabaseAuthProvider>);
    expect(await screen.findByLabelText('邮箱')).toBeVisible();
    expect(screen.getByLabelText('密码')).toBeVisible();
    expect(screen.getByRole('button', { name: '登录' })).toBeVisible();
  });

  it('signs in through Supabase and transitions via the existing session handling', async () => {
    const user = userEvent.setup();
    const { client, signInWithPassword, emit } = createClient(null);
    const repository = repositoryWithProfile(active);
    signInWithPassword.mockImplementation(async () => {
      emit({ user: { id: 'user-one' } });
      return { data: { session: { user: { id: 'user-one' } } }, error: null };
    });
    render(<SupabaseAuthProvider client={client} repository={repository}><StateProbe /></SupabaseAuthProvider>);
    await screen.findByLabelText('邮箱');
    await user.type(screen.getByLabelText('邮箱'), 'member@example.com');
    await user.type(screen.getByLabelText('密码'), 'secret');
    await user.click(screen.getByRole('button', { name: '登录' }));
    expect(await screen.findByText('ready:user-one:no-email')).toBeVisible();
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'member@example.com', password: 'secret' });
  });

  it('signs out through the auth context and returns to the login form', async () => {
    const user = userEvent.setup();
    const { client, emit } = createClient({ user: { id: 'user-one' } });
    vi.mocked(client.auth.signOut).mockImplementation(async () => { emit(null, 'SIGNED_OUT'); return { error: null }; });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(active)}><SignOutProbe /></SupabaseAuthProvider>);
    await screen.findByRole('button', { name: 'signout' });
    await user.click(screen.getByRole('button', { name: 'signout' }));
    expect(await screen.findByRole('heading', { name: '登录 Northstar OKR' })).toBeVisible();
  });

  it('renders the invite acceptance page when arriving through the invite link, even with the email already confirmed', async () => {
    setInviteLocation();
    // Supabase confirms the email when the invite link is verified, so
    // email_confirmed_at is already set here. Invite state must come from the
    // invite route, not from email_confirmed_at === null.
    const { client, settleInitialize } = createClient(inviteeSession, { deferred: true });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(inviteeActive)}><StateProbe /></SupabaseAuthProvider>);
    await act(async () => { settleInitialize(); });
    expect(await screen.findByRole('heading', { name: '欢迎加入 Northstar OKR' })).toBeVisible();
    expect(screen.getByDisplayValue('invitee@example.com')).toBeDisabled();
  });

  it('subscribes to auth state before driving initialization, and initializes exactly once', async () => {
    setInviteLocation();
    const { client, initialize, onAuthStateChange, settleInitialize } = createClient(inviteeSession, { deferred: true });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(inviteeActive)}><StateProbe /></SupabaseAuthProvider>);

    // The provider must install the subscription before it starts initialization,
    // so a callback session can never be missed.
    expect(onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(onAuthStateChange.mock.invocationCallOrder[0]).toBeLessThan(initialize.mock.invocationCallOrder[0]);

    await act(async () => { settleInitialize(); });
    expect(await screen.findByRole('heading', { name: '欢迎加入 Northstar OKR' })).toBeVisible();
    expect(initialize).toHaveBeenCalledTimes(1);
  });

  it('does not begin initialization before the provider driver triggers it', async () => {
    setInviteLocation();
    const { client, initialize, settleInitialize } = createClient(inviteeSession, { deferred: true });

    expect(initialize).not.toHaveBeenCalled();

    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(inviteeActive)}><StateProbe /></SupabaseAuthProvider>);
    expect(initialize).toHaveBeenCalledTimes(1);

    await act(async () => { settleInitialize(); });
    expect(await screen.findByRole('heading', { name: '欢迎加入 Northstar OKR' })).toBeVisible();
  });

  it('reaches signed-out login only after deferred initialization completes', async () => {
    const { client, initialize, settleInitialize } = createClient(null, { deferred: true });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(active)}><StateProbe /></SupabaseAuthProvider>);

    expect(screen.getByRole('heading', { name: '正在验证身份' })).toBeVisible();
    expect(screen.queryByLabelText('邮箱')).not.toBeInTheDocument();

    await act(async () => { settleInitialize(); });
    expect(await screen.findByRole('heading', { name: '登录 Northstar OKR' })).toBeVisible();
    expect(initialize).toHaveBeenCalledTimes(1);
  });

  it('recovers a persisted administrator session once deferred initialization completes', async () => {
    const { client, initialize, settleInitialize } = createClient(adminSession, { deferred: true });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(adminActive)}><StateProbe /></SupabaseAuthProvider>);

    expect(screen.getByRole('heading', { name: '正在验证身份' })).toBeVisible();

    await act(async () => { settleInitialize(); });
    expect(await screen.findByText('ready:admin:admin@example.com')).toBeVisible();
    expect(initialize).toHaveBeenCalledTimes(1);
  });

  it('sets the invitee password and transitions to the ready state', async () => {
    const user = userEvent.setup();
    setInviteLocation();
    const repository = repositoryWithProfile(inviteeActive);
    const { client, updateUser, emit, settleInitialize } = createClient(inviteeSession, { deferred: true });
    updateUser.mockImplementation(async () => {
      emit(inviteeSession, 'USER_UPDATED');
      return { data: { user: inviteeSession.user }, error: null };
    });
    render(<SupabaseAuthProvider client={client} repository={repository}><StateProbe /></SupabaseAuthProvider>);
    await act(async () => { settleInitialize(); });

    await screen.findByRole('heading', { name: '欢迎加入 Northstar OKR' });
    await user.type(screen.getByLabelText('新密码 *'), 'secret123');
    await user.type(screen.getByLabelText('确认密码 *'), 'secret123');
    await user.click(screen.getByRole('button', { name: '完成账号设置' }));

    expect(await screen.findByText('ready:invitee:invitee@example.com')).toBeVisible();
    expect(updateUser).toHaveBeenCalledWith({ password: 'secret123' });
  });

  it('does not enter invite mode for a normal confirmed session', async () => {
    // No auth callback in the URL, so a confirmed user is treated normally.
    const { client } = createClient({ user: { id: 'user-one', email: 'one@example.com', email_confirmed_at: '2026-08-17T00:00:00Z' } });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(active)}><StateProbe /></SupabaseAuthProvider>);
    expect(await screen.findByText('ready:user-one:one@example.com')).toBeVisible();
    expect(screen.queryByRole('heading', { name: '欢迎加入 Northstar OKR' })).not.toBeInTheDocument();
  });

  it('never renders the pre-existing administrator for a valid employee invite callback', async () => {
    setInviteLocation();
    // An administrator is already signed in; opening a valid employee invitation
    // must replace their session with the invitee and land on the invitee's
    // InviteAccept — never the administrator's dashboard.
    const { client, settleInitialize } = createClient(adminSession, { deferred: true, callbackSession: inviteeSession });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(inviteeActive)}><StateProbe /></SupabaseAuthProvider>);

    expect(screen.getByRole('heading', { name: '正在验证身份' })).toBeVisible();
    expect(screen.queryByText('ready:admin:admin@example.com')).not.toBeInTheDocument();

    await act(async () => { settleInitialize(); });

    expect(await screen.findByRole('heading', { name: '欢迎加入 Northstar OKR' })).toBeVisible();
    expect(screen.getByDisplayValue('invitee@example.com')).toBeDisabled();
    expect(screen.queryByDisplayValue('admin@example.com')).not.toBeInTheDocument();
    expect(screen.queryByText('ready:admin:admin@example.com')).not.toBeInTheDocument();
  });

  it('shows the explicit expired page for an expired invite callback, never login or the stale session', async () => {
    setInviteLocation();
    // A genuine-format callback whose token has expired/reused fails the
    // exchange: Supabase returns an initialization error and preserves any prior
    // session. It must NOT fall through to login or the preserved session.
    const { client, settleInitialize } = createClient(adminSession, {
      initializeError: { message: 'expired token' },
      deferred: true,
    });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(adminActive)}><StateProbe /></SupabaseAuthProvider>);

    expect(screen.getByRole('heading', { name: '正在验证身份' })).toBeVisible();

    await act(async () => { settleInitialize(); });

    expect(await screen.findByRole('heading', { name: '邀请链接已失效' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: '欢迎加入 Northstar OKR' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('新密码 *')).not.toBeInTheDocument();
    expect(screen.queryByText('ready:admin:admin@example.com')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('邮箱')).not.toBeInTheDocument();
  });

  it('does not flash a signed-out login before InviteAccept for a valid invite with no prior session', async () => {
    setInviteLocation();
    // No pre-existing session. A valid callback yields the invitee session via
    // getSession(); there must be no transient signed_out/login page.
    const { client, settleInitialize } = createClient(null, { deferred: true, callbackSession: inviteeSession });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(inviteeActive)}><StateProbe /></SupabaseAuthProvider>);

    expect(screen.getByRole('heading', { name: '正在验证身份' })).toBeVisible();
    expect(screen.queryByLabelText('邮箱')).not.toBeInTheDocument();

    await act(async () => { settleInitialize(); });
    expect(await screen.findByRole('heading', { name: '欢迎加入 Northstar OKR' })).toBeVisible();
    expect(screen.queryByLabelText('密码')).not.toBeInTheDocument();
  });

  it('recovers the administrator normally for a forged PKCE code with no verifier', async () => {
    setForgedCodeLocation();
    // A bare ?code= is NOT a candidate: this app uses implicit flow, and
    // readInviteCandidate requires type=invite plus the full token set. The
    // administrator therefore recovers normally and never sees InviteAccept.
    const { client } = createClient(adminSession);
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(adminActive)}><StateProbe /></SupabaseAuthProvider>);

    expect(await screen.findByText('ready:admin:admin@example.com')).toBeVisible();
    expect(screen.queryByRole('heading', { name: '欢迎加入 Northstar OKR' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('新密码 *')).not.toBeInTheDocument();
  });

  it('recovers the administrator normally for an incomplete #access_token callback', async () => {
    setIncompleteCallbackLocation();
    // Only an access_token is present; the complete implicit token set is
    // missing, so this is not a candidate and the administrator recovers.
    const { client } = createClient(adminSession);
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(adminActive)}><StateProbe /></SupabaseAuthProvider>);

    expect(await screen.findByText('ready:admin:admin@example.com')).toBeVisible();
    expect(screen.queryByRole('heading', { name: '欢迎加入 Northstar OKR' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('新密码 *')).not.toBeInTheDocument();
  });

  it('does not treat a recovered SIGNED_IN session as an invite when the URL only looks invite-like', async () => {
    setIncompleteCallbackLocation();
    // Recovery emits SIGNED_IN carrying the administrator's own session. Because
    // the URL is not a genuine invite candidate, that event must never validate
    // a candidate or expose InviteAccept.
    const { client, emit } = createClient(adminSession);
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(adminActive)}><StateProbe /></SupabaseAuthProvider>);

    act(() => emit(adminSession, 'SIGNED_IN'));

    expect(await screen.findByText('ready:admin:admin@example.com')).toBeVisible();
    expect(screen.queryByRole('heading', { name: '欢迎加入 Northstar OKR' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('新密码 *')).not.toBeInTheDocument();
  });

  it('resolves a normal session on a manual /auth/invite visit with no callback', async () => {
    window.history.pushState({}, '', '/auth/invite'); // no token in the URL
    const { client } = createClient({ user: { id: 'user-one', email: 'one@example.com', email_confirmed_at: '2026-08-17T00:00:00Z' } });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(active)}><StateProbe /></SupabaseAuthProvider>);
    expect(await screen.findByText('ready:user-one:one@example.com')).toBeVisible();
    expect(screen.queryByRole('heading', { name: '欢迎加入 Northstar OKR' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('新密码 *')).not.toBeInTheDocument();
  });

  it('reaches the dashboard after the invitee completes password setup', async () => {
    const user = userEvent.setup();
    setInviteLocation();
    const { client, updateUser, emit, settleInitialize } = createClient(inviteeSession, { deferred: true });
    updateUser.mockImplementation(async () => {
      emit(inviteeSession, 'USER_UPDATED');
      return { data: { user: inviteeSession.user }, error: null };
    });

    render(
      <SupabaseAuthProvider client={client} repository={repositoryWithProfile(inviteeActive)}>
        <MemoryRouter initialEntries={['/auth/invite']}>
          <Routes>
            <Route path="/auth/invite" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<h1>dashboard reached</h1>} />
          </Routes>
        </MemoryRouter>
      </SupabaseAuthProvider>,
    );
    await act(async () => { settleInitialize(); });

    await screen.findByRole('heading', { name: '欢迎加入 Northstar OKR' });
    await user.type(screen.getByLabelText('新密码 *'), 'secret123');
    await user.type(screen.getByLabelText('确认密码 *'), 'secret123');
    await user.click(screen.getByRole('button', { name: '完成账号设置' }));

    expect(await screen.findByRole('heading', { name: 'dashboard reached' })).toBeVisible();
  });

  it('renders the password-setup form for a recovery callback (confirmed-but-incomplete)', async () => {
    setRecoveryLocation();
    // A confirmed-but-incomplete user arrives via resetPasswordForEmail, whose
    // callback carries type=recovery. It must reach the same setup form as an
    // invite — without depending on a SIGNED_IN event (gotrue emits
    // PASSWORD_RECOVERY for recovery callbacks).
    const { client, settleInitialize } = createClient(inviteeSession, { deferred: true });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(inviteeActive)}><StateProbe /></SupabaseAuthProvider>);
    await act(async () => { settleInitialize(); });

    expect(await screen.findByRole('heading', { name: '欢迎加入 Northstar OKR' })).toBeVisible();
    expect(screen.getByDisplayValue('invitee@example.com')).toBeDisabled();
  });

  it('marks onboarding complete after the invitee sets a password', async () => {
    const user = userEvent.setup();
    setInviteLocation();
    const { client, rpc, updateUser, emit, settleInitialize } = createClient(inviteeSession, { deferred: true });
    updateUser.mockImplementation(async () => {
      emit(inviteeSession, 'USER_UPDATED');
      return { data: { user: inviteeSession.user }, error: null };
    });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(inviteeActive)}><StateProbe /></SupabaseAuthProvider>);
    await act(async () => { settleInitialize(); });

    await screen.findByRole('heading', { name: '欢迎加入 Northstar OKR' });
    await user.type(screen.getByLabelText('新密码 *'), 'secret123');
    await user.type(screen.getByLabelText('确认密码 *'), 'secret123');
    await user.click(screen.getByRole('button', { name: '完成账号设置' }));

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('complete_onboarding'));
    expect(updateUser).toHaveBeenCalledWith({ password: 'secret123' });
  });

  it('does not mark onboarding complete when the password write fails', async () => {
    const user = userEvent.setup();
    setInviteLocation();
    const { client, rpc, updateUser, settleInitialize } = createClient(inviteeSession, { deferred: true });
    updateUser.mockImplementation(async () => ({ data: { user: null }, error: { message: 'boom' } }));
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(inviteeActive)}><StateProbe /></SupabaseAuthProvider>);
    await act(async () => { settleInitialize(); });

    await screen.findByRole('heading', { name: '欢迎加入 Northstar OKR' });
    await user.type(screen.getByLabelText('新密码 *'), 'secret123');
    await user.type(screen.getByLabelText('确认密码 *'), 'secret123');
    await user.click(screen.getByRole('button', { name: '完成账号设置' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('账号设置失败');
    expect(updateUser).toHaveBeenCalledWith({ password: 'secret123' });
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: '欢迎加入 Northstar OKR' })).toBeVisible();
  });

  it('keeps InviteAccept visible while onboarding RPC is in flight, never rendering the dashboard transiently', async () => {
    const user = userEvent.setup();
    setInviteLocation();
    let resolveRpc: ((value: { data: unknown; error: { message: string } | null }) => void) | undefined;
    const { client, updateUser, rpc, emit, settleInitialize } = createClient(inviteeSession, { deferred: true });
    updateUser.mockImplementation(async () => {
      emit(inviteeSession, 'USER_UPDATED');
      return { data: { user: inviteeSession.user }, error: null };
    });
    rpc.mockImplementation(() => new Promise((resolve) => { resolveRpc = resolve; }));
    render(
      <SupabaseAuthProvider client={client} repository={repositoryWithProfile(inviteeActive)}>
        <MemoryRouter initialEntries={['/auth/invite']}>
          <Routes>
            <Route path="/auth/invite" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<h1>dashboard reached</h1>} />
          </Routes>
        </MemoryRouter>
      </SupabaseAuthProvider>,
    );
    await act(async () => { settleInitialize(); });

    await screen.findByRole('heading', { name: '欢迎加入 Northstar OKR' });
    await user.type(screen.getByLabelText('新密码 *'), 'secret123');
    await user.type(screen.getByLabelText('确认密码 *'), 'secret123');
    await user.click(screen.getByRole('button', { name: '完成账号设置' }));

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'secret123' }));
    expect(screen.getByRole('heading', { name: '欢迎加入 Northstar OKR' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'dashboard reached' })).not.toBeInTheDocument();

    await act(async () => { resolveRpc?.({ data: null, error: null }); });
    expect(await screen.findByRole('heading', { name: 'dashboard reached' })).toBeVisible();
  });

  it('keeps the user on InviteAccept when the onboarding RPC fails, without clearing invite state', async () => {
    const user = userEvent.setup();
    setInviteLocation();
    const { client, updateUser, rpc, emit, settleInitialize } = createClient(inviteeSession, { deferred: true });
    updateUser.mockImplementation(async () => {
      emit(inviteeSession, 'USER_UPDATED');
      return { data: { user: inviteeSession.user }, error: null };
    });
    rpc.mockImplementation(async () => ({ data: null, error: { message: 'rpc boom' } }));
    render(
      <SupabaseAuthProvider client={client} repository={repositoryWithProfile(inviteeActive)}>
        <MemoryRouter initialEntries={['/auth/invite']}>
          <Routes>
            <Route path="/auth/invite" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<h1>dashboard reached</h1>} />
          </Routes>
        </MemoryRouter>
      </SupabaseAuthProvider>,
    );
    await act(async () => { settleInitialize(); });

    await screen.findByRole('heading', { name: '欢迎加入 Northstar OKR' });
    await user.type(screen.getByLabelText('新密码 *'), 'secret123');
    await user.type(screen.getByLabelText('确认密码 *'), 'secret123');
    await user.click(screen.getByRole('button', { name: '完成账号设置' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('账号设置失败');
    expect(updateUser).toHaveBeenCalledWith({ password: 'secret123' });
    expect(rpc).toHaveBeenCalledWith('complete_onboarding');
    expect(screen.getByRole('heading', { name: '欢迎加入 Northstar OKR' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'dashboard reached' })).not.toBeInTheDocument();
  });

  it('keeps normal USER_UPDATED behavior outside an onboarding transaction', async () => {
    const { client, emit } = createClient({ user: { id: 'user-one', email: 'one@example.com' } });
    const repository = repositoryWithProfile(active);
    render(<SupabaseAuthProvider client={client} repository={repository}><StateProbe /></SupabaseAuthProvider>);
    expect(await screen.findByText('ready:user-one:one@example.com')).toBeVisible();

    act(() => emit({ user: { id: 'user-one', email: 'one@example.com' } }, 'USER_UPDATED'));
    expect(await screen.findByText('ready:user-one:one@example.com')).toBeVisible();
  });

  it('completes onboarding through the same path for a recovery callback', async () => {
    const user = userEvent.setup();
    setRecoveryLocation();
    const { client, updateUser, rpc, emit, settleInitialize } = createClient(inviteeSession, { deferred: true });
    updateUser.mockImplementation(async () => {
      emit(inviteeSession, 'USER_UPDATED');
      return { data: { user: inviteeSession.user }, error: null };
    });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(inviteeActive)}><StateProbe /></SupabaseAuthProvider>);
    await act(async () => { settleInitialize(); });

    await screen.findByRole('heading', { name: '欢迎加入 Northstar OKR' });
    await user.type(screen.getByLabelText('新密码 *'), 'secret123');
    await user.type(screen.getByLabelText('确认密码 *'), 'secret123');
    await user.click(screen.getByRole('button', { name: '完成账号设置' }));

    expect(await screen.findByText('ready:invitee:invitee@example.com')).toBeVisible();
    expect(rpc).toHaveBeenCalledWith('complete_onboarding');
  });
});

describe('SupabaseAuthProvider — setup state machine (ordering-invariant)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.pushState({}, '/');
  });

  it('resolves InviteAccept when SIGNED_IN fires before initialize() resolves', async () => {
    setInviteLocation();
    const { client, emit, settleInitialize } = createClient(inviteeSession, { deferred: true });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(inviteeActive)}><StateProbe /></SupabaseAuthProvider>);

    // Order A: the auth event arrives BEFORE the initialize() outcome. It must be
    // ignored while the callback is unresolved, and getSession() decides.
    act(() => emit(inviteeSession, 'SIGNED_IN'));
    await act(async () => { settleInitialize(); });

    expect(await screen.findByRole('heading', { name: '欢迎加入 Northstar OKR' })).toBeVisible();
    expect(screen.getByDisplayValue('invitee@example.com')).toBeDisabled();
  });

  it('resolves InviteAccept when initialize() resolves before SIGNED_IN', async () => {
    setInviteLocation();
    const { client, emit, settleInitialize } = createClient(inviteeSession, { deferred: true });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(inviteeActive)}><StateProbe /></SupabaseAuthProvider>);

    // Order B: initialize() resolves first; the later SIGNED_IN must not disturb
    // the definitive setup outcome.
    await act(async () => { settleInitialize(); });
    act(() => emit(inviteeSession, 'SIGNED_IN'));

    expect(await screen.findByRole('heading', { name: '欢迎加入 Northstar OKR' })).toBeVisible();
    expect(screen.getByDisplayValue('invitee@example.com')).toBeDisabled();
  });

  it('still resolves InviteAccept when INITIAL_SESSION carries the invitee session', async () => {
    setInviteLocation();
    const { client, emit, settleInitialize } = createClient(inviteeSession, { deferred: true });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(inviteeActive)}><StateProbe /></SupabaseAuthProvider>);

    act(() => emit(inviteeSession, 'INITIAL_SESSION'));
    await act(async () => { settleInitialize(); });

    expect(await screen.findByRole('heading', { name: '欢迎加入 Northstar OKR' })).toBeVisible();
  });

  it('never renders unassigned for a valid invite whose session resolves before SIGNED_IN', async () => {
    setInviteLocation();
    const { client, settleInitialize } = createClient(null, { deferred: true, callbackSession: inviteeSession });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(inviteeActive)}><StateProbe /></SupabaseAuthProvider>);

    await act(async () => { settleInitialize(); });

    expect(await screen.findByRole('heading', { name: '欢迎加入 Northstar OKR' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: '等待管理员分配' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '登录 Northstar OKR' })).not.toBeInTheDocument();
  });

  it('renders an explicit provisioning error when a valid callback has no application profile', async () => {
    setInviteLocation();
    // A valid callback but the profile/role is missing — a PROVISIONING error,
    // never "waiting for administrator assignment".
    const { client, settleInitialize } = createClient(inviteeSession, { deferred: true });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(unassignedState)}><StateProbe /></SupabaseAuthProvider>);

    await act(async () => { settleInitialize(); });

    expect(await screen.findByRole('heading', { name: '账号配置异常' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: '等待管理员分配' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '欢迎加入 Northstar OKR' })).not.toBeInTheDocument();
  });

  it('denies a valid callback for a deactivated invitee instead of letting password setup reactivate them', async () => {
    setInviteLocation();
    // Deactivated before acceptance: the callback may authenticate, but the
    // account must not become active or reach password setup.
    const { client, settleInitialize } = createClient(inviteeSession, { deferred: true });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(inactiveState)}><StateProbe /></SupabaseAuthProvider>);

    await act(async () => { settleInitialize(); });

    expect(await screen.findByRole('heading', { name: '账户已停用' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: '欢迎加入 Northstar OKR' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('新密码 *')).not.toBeInTheDocument();
  });

  it('uses the authoritative DB role after onboarding, not stale invite metadata', async () => {
    const user = userEvent.setup();
    setInviteLocation();
    // The administrator edited the invitee's role from employee to management
    // after sending the invitation. The application database is authoritative,
    // so the resolved role must be management.
    const { client, updateUser, emit, settleInitialize } = createClient(inviteeSession, { deferred: true });
    updateUser.mockImplementation(async () => {
      emit(inviteeSession, 'USER_UPDATED');
      return { data: { user: inviteeSession.user }, error: null };
    });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(managementInviteeActive)}><RoleProbe /></SupabaseAuthProvider>);
    await act(async () => { settleInitialize(); });

    await screen.findByRole('heading', { name: '欢迎加入 Northstar OKR' });
    await user.type(screen.getByLabelText('新密码 *'), 'secret123');
    await user.type(screen.getByLabelText('确认密码 *'), 'secret123');
    await user.click(screen.getByRole('button', { name: '完成账号设置' }));

    expect(await screen.findByText('role:management')).toBeVisible();
  });

  it('does not expose InviteAccept for a manual /auth/invite visit without a callback', async () => {
    window.history.pushState({}, '', '/auth/invite'); // no token
    const { client } = createClient({ user: { id: 'user-one', email: 'one@example.com' } });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(active)}><StateProbe /></SupabaseAuthProvider>);

    expect(await screen.findByText('ready:user-one:one@example.com')).toBeVisible();
    expect(screen.queryByRole('heading', { name: '欢迎加入 Northstar OKR' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('新密码 *')).not.toBeInTheDocument();
  });
});
