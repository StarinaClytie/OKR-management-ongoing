import { act, render, screen, waitFor } from '@testing-library/react';
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
  const client: SupabaseClientLike = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: initialSession }, error: null })),
      onAuthStateChange: vi.fn((callback) => {
        listener = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signInWithPassword,
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: vi.fn() as never,
    rpc: vi.fn() as never,
    storage: {} as never,
  };
  return { client, signInWithPassword, emit: (session: SessionLike | null) => listener?.('SIGNED_IN', session) };
}

function repositoryWithProfile(result: RepositoryResult<AuthProfileState>): OkrRepository {
  return {
    mode: 'supabase',
    getCurrentProfile: vi.fn(async () => result),
  } as unknown as OkrRepository;
}

const active = { ok: true as const, data: { kind: 'active' as const, user: employee } };

describe('SupabaseAuthProvider', () => {
  beforeEach(() => window.localStorage.clear());

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
    vi.mocked(client.auth.signOut).mockImplementation(async () => { emit(null); return { error: null }; });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile(active)}><SignOutProbe /></SupabaseAuthProvider>);
    await screen.findByRole('button', { name: 'signout' });
    await user.click(screen.getByRole('button', { name: 'signout' }));
    expect(await screen.findByRole('heading', { name: '登录 Northstar OKR' })).toBeVisible();
  });
});
