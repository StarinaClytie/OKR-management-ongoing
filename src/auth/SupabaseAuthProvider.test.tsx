import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoleSwitcher } from '../layout/RoleSwitcher';
import type { OkrRepository, RepositoryResult, SessionLike, SupabaseClientLike } from '../data/types';
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
  return <output>{`${auth.status}:${auth.currentUser?.id ?? 'none'}`}</output>;
}

function createClient(initialSession: SessionLike | null) {
  let listener: ((event: string, session: SessionLike | null) => void) | undefined;
  const client: SupabaseClientLike = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: initialSession }, error: null })),
      onAuthStateChange: vi.fn((callback) => {
        listener = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: vi.fn() as never,
    rpc: vi.fn() as never,
    storage: {} as never,
  };
  return { client, emit: (session: SessionLike | null) => listener?.('SIGNED_IN', session) };
}

function repositoryWithProfile(result: RepositoryResult<User | null>): OkrRepository {
  return {
    mode: 'supabase',
    getCurrentProfile: vi.fn(async () => result),
  } as unknown as OkrRepository;
}

describe('SupabaseAuthProvider', () => {
  beforeEach(() => window.localStorage.clear());

  it('renders signed-out state without demo identity', async () => {
    const { client } = createClient(null);
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile({ ok: true, data: employee })}><StateProbe /></SupabaseAuthProvider>);
    expect(await screen.findByRole('heading', { name: '登录 Northstar OKR' })).toBeVisible();
  });

  it('renders assignment-pending when authenticated identity has no profile', async () => {
    const { client } = createClient({ user: { id: 'unassigned' } });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile({ ok: true, data: null })}><StateProbe /></SupabaseAuthProvider>);
    expect(await screen.findByRole('heading', { name: '等待管理员分配' })).toBeVisible();
  });

  it('uses the stored locale and allows switching on signed-out screens', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('northstar.locale', 'en');
    const { client } = createClient(null);

    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile({ ok: true, data: employee })}><StateProbe /></SupabaseAuthProvider>);

    expect(await screen.findByRole('heading', { name: 'Sign in to Northstar OKR' })).toBeVisible();
    expect(document.documentElement.lang).toBe('en');
    await user.click(screen.getByRole('button', { name: 'Switch to Chinese' }));
    expect(screen.getByRole('heading', { name: '登录 Northstar OKR' })).toBeVisible();
    expect(document.documentElement.lang).toBe('zh-CN');
  });

  it('clears the previous user synchronously before loading a changed session', async () => {
    let resolveSecond: ((value: RepositoryResult<User | null>) => void) | undefined;
    const repository = repositoryWithProfile({ ok: true, data: employee });
    vi.mocked(repository.getCurrentProfile)
      .mockResolvedValueOnce({ ok: true, data: employee })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    const { client, emit } = createClient({ user: { id: 'user-one' } });
    render(<SupabaseAuthProvider client={client} repository={repository}><StateProbe /></SupabaseAuthProvider>);
    expect(await screen.findByText('ready:user-one')).toBeVisible();

    act(() => emit({ user: { id: 'user-two' } }));
    expect(screen.getByRole('heading', { name: '正在验证身份' })).toBeVisible();

    await act(async () => resolveSecond?.({ ok: true, data: { ...employee, id: 'user-two' } }));
    await waitFor(() => expect(screen.getByText('ready:user-two')).toBeVisible());
  });

  it('never renders the demo role switcher in Supabase mode', async () => {
    const { client } = createClient({ user: { id: 'user-one' } });
    render(<SupabaseAuthProvider client={client} repository={repositoryWithProfile({ ok: true, data: employee })}><RoleSwitcher /></SupabaseAuthProvider>);
    await waitFor(() => expect(screen.queryByLabelText('演示角色')).not.toBeInTheDocument());
  });
});
