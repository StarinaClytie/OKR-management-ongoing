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

function StateProbe() {
  const auth = useAuth();
  return <output>{`${auth.status}:${auth.currentUser?.id ?? 'none'}:${auth.email ?? 'no-email'}`}</output>;
}

function SignOutProbe() {
  const { signOut } = useAuth();
  return <button onClick={() => void signOut()}>signout</button>;
}

interface CreateClientOptions {
  initializeError?: { message: string } | null;
  deferred?: boolean;
}

function createClient(initialSession: SessionLike | null, options: CreateClientOptions = {}) {
  const { initializeError = null, deferred = false } = options;
  let listener: ((event: string, session: SessionLike | null) => void) | undefined;
  let settleInitialize: ((value: { error: { message: string } | null }) => void) | undefined;
  const signInWithPassword = vi.fn(async (): Promise<{ data: { session: SessionLike | null }; error: { message: string } | null }> => ({ data: { session: null }, error: null }));
  const updateUser = vi.fn(async (): Promise<{ data: { user: SessionLike['user'] | null }; error: { message: string } | null }> => ({ data: { user: null }, error: null }));
  const initialize = deferred
    ? vi.fn(() => new Promise<{ error: { message: string } | null }>((resolve) => { settleInitialize = resolve; }))
    : vi.fn(async () => ({ error: initializeError }));
  const getSession = vi.fn(async () => ({ data: { session: initialSession }, error: null }));
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
    rpc: vi.fn() as never,
    storage: {} as never,
  };
  return {
    client,
    signInWithPassword,
    updateUser,
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
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile({ ok: true, data: { kind: 'unassigned' } })}><StateProbe /></SupabaseAuthProvider>);
    expect(await screen.findByRole('heading', { name: '等待管理员分配' })).toBeVisible();
  });

  it('renders the deactivated-account message for an inactive profile', async () => {
    const { client } = createClient({ user: { id: 'user-one', email: 'one@example.com' } });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile({ ok: true, data: { kind: 'inactive' } })}><StateProbe /></SupabaseAuthProvider>);
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
    const { client, emit, settleInitialize } = createClient(inviteeSession, { deferred: true });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(active)}><StateProbe /></SupabaseAuthProvider>);
    // Supabase proves the callback: initialize() resolves successfully, then it
    // emits SIGNED_IN carrying the invitee session.
    await act(async () => { settleInitialize(); });
    act(() => emit(inviteeSession, 'SIGNED_IN'));
    expect(await screen.findByRole('heading', { name: '欢迎加入 Northstar OKR' })).toBeVisible();
    expect(screen.getByDisplayValue('invitee@example.com')).toBeDisabled();
  });

  it('subscribes to auth state before driving initialization, and initializes exactly once', async () => {
    setInviteLocation();
    const { client, initialize, onAuthStateChange, settleInitialize, emit } = createClient(inviteeSession, { deferred: true });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(active)}><StateProbe /></SupabaseAuthProvider>);

    // The provider must install the subscription before it starts initialization,
    // so a SIGNED_IN emitted during initialization can never be missed.
    expect(onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(onAuthStateChange.mock.invocationCallOrder[0]).toBeLessThan(initialize.mock.invocationCallOrder[0]);

    await act(async () => { settleInitialize(); });
    act(() => emit(inviteeSession, 'SIGNED_IN'));
    expect(await screen.findByRole('heading', { name: '欢迎加入 Northstar OKR' })).toBeVisible();
    expect(initialize).toHaveBeenCalledTimes(1);
  });

  it('does not begin initialization before the provider driver triggers it', async () => {
    setInviteLocation();
    const { client, initialize, settleInitialize, emit } = createClient(inviteeSession, { deferred: true });

    // Construction alone must not initialize: with skipAutoInitialize the
    // constructor is inert and the provider is the sole owner.
    expect(initialize).not.toHaveBeenCalled();

    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(active)}><StateProbe /></SupabaseAuthProvider>);
    expect(initialize).toHaveBeenCalledTimes(1);

    await act(async () => { settleInitialize(); });
    act(() => emit(inviteeSession, 'SIGNED_IN'));
    expect(await screen.findByRole('heading', { name: '欢迎加入 Northstar OKR' })).toBeVisible();
  });

  it('reaches signed-out login only after deferred initialization completes', async () => {
    const { client, initialize, settleInitialize } = createClient(null, { deferred: true });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(active)}><StateProbe /></SupabaseAuthProvider>);

    // Initialization is still pending: no login form may appear yet.
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
    act(() => emit(inviteeSession, 'SIGNED_IN'));

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

  it('never renders the pre-existing administrator before a valid invite callback resolves', async () => {
    setInviteLocation();
    // An administrator is already signed in; getSession() resolves with their
    // session before the deferred SIGNED_IN(invitee) arrives. The administrator
    // application/dashboard must never render in between — only the invitee's
    // InviteAccept once the callback is proven.
    const { client, emit, settleInitialize } = createClient(adminSession, { deferred: true });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(adminActive)}><StateProbe /></SupabaseAuthProvider>);

    // The callback is unresolved/resolving: the app stays verifying, never ready.
    expect(screen.getByRole('heading', { name: '正在验证身份' })).toBeVisible();
    expect(screen.queryByText('ready:admin:admin@example.com')).not.toBeInTheDocument();

    // initialize() resolves successfully (getSession() still returns the stale
    // administrator), then the valid callback establishes the invitee session.
    await act(async () => { settleInitialize(); });
    act(() => emit(inviteeSession, 'SIGNED_IN'));

    expect(await screen.findByRole('heading', { name: '欢迎加入 Northstar OKR' })).toBeVisible();
    expect(screen.getByDisplayValue('invitee@example.com')).toBeDisabled();
    expect(screen.queryByDisplayValue('admin@example.com')).not.toBeInTheDocument();
    expect(screen.queryByText('ready:admin:admin@example.com')).not.toBeInTheDocument();
  });

  it('holds verifying for an expired genuine invite callback, then resumes the administrator session', async () => {
    setInviteLocation();
    // A genuine-format callback whose token has expired/been reused fails the
    // exchange: Supabase returns an initialization error, preserves the
    // administrator session, and emits no SIGNED_IN.
    const { client, settleInitialize } = createClient(adminSession, {
      initializeError: { message: 'expired token' },
      deferred: true,
    });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(adminActive)}><StateProbe /></SupabaseAuthProvider>);

    // While the callback is unresolved the app stays verifying, never ready.
    expect(screen.getByRole('heading', { name: '正在验证身份' })).toBeVisible();
    expect(screen.queryByText('ready:admin:admin@example.com')).not.toBeInTheDocument();

    // The failure resolves and the preserved administrator session resumes.
    act(() => settleInitialize());
    expect(await screen.findByText('ready:admin:admin@example.com')).toBeVisible();
    expect(screen.queryByRole('heading', { name: '欢迎加入 Northstar OKR' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('新密码 *')).not.toBeInTheDocument();
  });

  it('does not flash a signed-out login before InviteAccept for a valid invite with no session', async () => {
    setInviteLocation();
    // No pre-existing session. The callback succeeds and the invitee session
    // arrives via SIGNED_IN; there must be no transient signed_out/login page.
    const { client, emit, settleInitialize } = createClient(null, { deferred: true });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(active)}><StateProbe /></SupabaseAuthProvider>);

    expect(screen.getByRole('heading', { name: '正在验证身份' })).toBeVisible();
    expect(screen.queryByLabelText('邮箱')).not.toBeInTheDocument();

    await act(async () => { settleInitialize(); });
    act(() => emit(inviteeSession, 'SIGNED_IN'));
    expect(await screen.findByRole('heading', { name: '欢迎加入 Northstar OKR' })).toBeVisible();
    // The login form's editable password field must never appear — InviteAccept
    // shows the invitee's disabled email plus its own password fields instead.
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
    // the candidate or expose InviteAccept.
    const { client, emit } = createClient(adminSession);
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(adminActive)}><StateProbe /></SupabaseAuthProvider>);

    act(() => emit(adminSession, 'SIGNED_IN'));

    expect(await screen.findByText('ready:admin:admin@example.com')).toBeVisible();
    expect(screen.queryByRole('heading', { name: '欢迎加入 Northstar OKR' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('新密码 *')).not.toBeInTheDocument();
  });

  it('does not expose the password form when an expired/reused callback falls back to the admin session', async () => {
    setInviteLocation();
    // A reused/expired token fails the exchange. Supabase surfaces the existing
    // administrator (via INITIAL_SESSION, not SIGNED_IN) and returns an
    // initialization error, which must not validate the candidate.
    const { client, emit } = createClient(adminSession, { initializeError: { message: 'expired token' } });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(adminActive)}><StateProbe /></SupabaseAuthProvider>);

    act(() => emit(adminSession, 'INITIAL_SESSION'));

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

    // The provider renders children (the router) once the invite completes, and
    // the /auth/invite route redirects to /dashboard.
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
    act(() => emit(inviteeSession, 'SIGNED_IN'));

    await screen.findByRole('heading', { name: '欢迎加入 Northstar OKR' });
    await user.type(screen.getByLabelText('新密码 *'), 'secret123');
    await user.type(screen.getByLabelText('确认密码 *'), 'secret123');
    await user.click(screen.getByRole('button', { name: '完成账号设置' }));

    expect(await screen.findByRole('heading', { name: 'dashboard reached' })).toBeVisible();
  });
});
