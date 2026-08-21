import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

function StateProbe() {
  const auth = useAuth();
  return <output>{`${auth.status}:${auth.currentUser?.id ?? 'none'}:${auth.email ?? 'no-email'}`}</output>;
}

function SignOutProbe() {
  const { signOut } = useAuth();
  return <button onClick={() => void signOut()}>signout</button>;
}

function createClient(initialSession: SessionLike | null) {
  let listener: ((event: string, session: SessionLike | null) => void) | undefined;
  const signInWithPassword = vi.fn(async (): Promise<{ data: { session: SessionLike | null }; error: { message: string } | null }> => ({ data: { session: null }, error: null }));
  const signUp = vi.fn(async (): Promise<{ data: { session: SessionLike | null }; error: { message: string } | null }> => ({ data: { session: null }, error: null }));
  const rpc = vi.fn(async (): Promise<{ data: unknown; error: { message: string } | null }> => ({ data: null, error: null }));
  const initialize = vi.fn(async () => ({ error: null }));
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
      signUp,
      updateUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: vi.fn() as never,
    rpc: rpc as never,
    storage: {} as never,
  };
  return {
    client,
    signInWithPassword,
    signUp,
    rpc,
    getSession,
    onAuthStateChange,
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
const pending = { ok: true as const, data: { kind: 'pending' as const } };
const inactiveState = { ok: true as const, data: { kind: 'inactive' as const } };
const errorState = { ok: true as const, data: { kind: 'error' as const } };

describe('SupabaseAuthProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  it('renders the email/password login form when signed out', async () => {
    const { client } = createClient(null);
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(active)}><StateProbe /></SupabaseAuthProvider>);
    expect(await screen.findByRole('heading', { name: '登录 TIME-TECH SPECTRA OKR' })).toBeVisible();
    expect(screen.getByLabelText('邮箱')).toBeVisible();
    expect(screen.getByLabelText('密码')).toBeVisible();
    expect(screen.getByRole('button', { name: '登录' })).toBeVisible();
  });

  it('offers account registration from the login form', async () => {
    const { client } = createClient(null);
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(active)}><StateProbe /></SupabaseAuthProvider>);
    expect(await screen.findByRole('button', { name: '还没有账号？注册' })).toBeVisible();
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

  it('switches to the registration form and registers a pending account', async () => {
    const user = userEvent.setup();
    const registeredSession = { user: { id: 'u-new', email: 'new@example.com' } };
    let session: SessionLike | null = null;
    const { client, signUp, rpc } = createClient(null);
    client.auth.getSession = vi.fn(async () => ({ data: { session }, error: null }));
    signUp.mockImplementation(async () => {
      session = registeredSession;
      return { data: { session: registeredSession }, error: null };
    });
    const repository = repositoryWithProfile(pending);
    render(<SupabaseAuthProvider client={client} repository={repository}><StateProbe /></SupabaseAuthProvider>);

    await user.click(await screen.findByRole('button', { name: '还没有账号？注册' }));
    await user.type(screen.getByLabelText('姓名'), '新员工');
    await user.type(screen.getByLabelText('邮箱'), 'new@example.com');
    await user.type(screen.getByLabelText('密码'), 'secret123');
    await user.type(screen.getByLabelText('确认密码'), 'secret123');
    await user.click(screen.getByRole('button', { name: '注册' }));

    expect(await screen.findByRole('heading', { name: '注册成功，等待管理员审批' })).toBeVisible();
    expect(signUp).toHaveBeenCalledWith({ email: 'new@example.com', password: 'secret123', options: { data: { display_name: '新员工' } } });
    expect(rpc).toHaveBeenCalledWith('create_pending_profile', { p_display_name: '新员工' });
  });

  it('renders the pending-approval screen for a pending profile', async () => {
    const { client } = createClient({ user: { id: 'u-new', email: 'new@example.com' } });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(pending)}><StateProbe /></SupabaseAuthProvider>);
    expect(await screen.findByRole('heading', { name: '注册成功，等待管理员审批' })).toBeVisible();
    expect(screen.getByText(/new@example\.com/)).toBeVisible();
    expect(screen.getByRole('button', { name: '刷新状态' })).toBeVisible();
  });

  it('refreshes a pending profile into the ready state once approved', async () => {
    const user = userEvent.setup();
    const repository = repositoryWithProfile(pending);
    vi.mocked(repository.getCurrentProfile)
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(active);
    const { client } = createClient({ user: { id: 'user-one', email: 'one@example.com' } });
    render(<SupabaseAuthProvider client={client} repository={repository}><StateProbe /></SupabaseAuthProvider>);

    await screen.findByRole('heading', { name: '注册成功，等待管理员审批' });
    await user.click(screen.getByRole('button', { name: '刷新状态' }));
    expect(await screen.findByText('ready:user-one:one@example.com')).toBeVisible();
  });

  it('renders the deactivated-account message for an inactive profile', async () => {
    const { client } = createClient({ user: { id: 'user-one', email: 'one@example.com' } });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(inactiveState)}><StateProbe /></SupabaseAuthProvider>);
    expect(await screen.findByRole('heading', { name: '账户已停用' })).toBeVisible();
  });

  it('renders an account error for a provisioning inconsistency', async () => {
    const { client } = createClient({ user: { id: 'user-one', email: 'one@example.com' } });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(errorState)}><StateProbe /></SupabaseAuthProvider>);
    expect(await screen.findByRole('heading', { name: '账户状态异常' })).toBeVisible();
  });

  it('signs out through the auth context and returns to the login form', async () => {
    const user = userEvent.setup();
    const { client, emit } = createClient({ user: { id: 'user-one' } });
    vi.mocked(client.auth.signOut).mockImplementation(async () => { emit(null, 'SIGNED_OUT'); return { error: null }; });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(active)}><SignOutProbe /></SupabaseAuthProvider>);
    await screen.findByRole('button', { name: 'signout' });
    await user.click(screen.getByRole('button', { name: 'signout' }));
    expect(await screen.findByRole('heading', { name: '登录 TIME-TECH SPECTRA OKR' })).toBeVisible();
  });

  it('surfaces the session email for an active user', async () => {
    const { client } = createClient({ user: { id: 'user-one', email: 'one@example.com' } });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(active)}><StateProbe /></SupabaseAuthProvider>);
    expect(await screen.findByText('ready:user-one:one@example.com')).toBeVisible();
  });

  it('never renders the demo role switcher in Supabase mode', async () => {
    const { client } = createClient({ user: { id: 'user-one' } });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(active)}><RoleSwitcher /></SupabaseAuthProvider>);
    await waitFor(() => expect(screen.queryByLabelText('演示角色')).not.toBeInTheDocument());
  });
});
