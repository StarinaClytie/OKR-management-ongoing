import { useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import type { User } from '../domain/types';
import type { OkrRepository, SessionLike, SupabaseClientLike } from '../data/types';
import { AuthContext, type AuthContextValue } from './AuthContext';

export interface SupabaseAuthProviderProps extends PropsWithChildren {
  client: SupabaseClientLike;
  repository: OkrRepository;
}

export function SupabaseAuthProvider({ children, client, repository }: SupabaseAuthProviderProps) {
  const [status, setStatus] = useState<AuthContextValue['status']>('loading');
  const [currentUser, setCurrentUser] = useState<User>();
  const requestVersion = useRef(0);

  useEffect(() => {
    let mounted = true;

    async function loadSession(session: SessionLike | null) {
      const version = ++requestVersion.current;
      setCurrentUser(undefined);
      if (!session) {
        setStatus('signed_out');
        return;
      }
      setStatus('loading');
      const result = await repository.getCurrentProfile();
      if (!mounted || version !== requestVersion.current) return;
      if (!result.ok || !result.data) {
        setStatus('unassigned');
        return;
      }
      if (result.data.id !== session.user.id) {
        setStatus('unassigned');
        return;
      }
      setCurrentUser(result.data);
      setStatus('ready');
    }

    void client.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      void loadSession(error ? null : data.session);
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      void loadSession(session);
    });
    return () => {
      mounted = false;
      requestVersion.current += 1;
      data.subscription.unsubscribe();
    };
  }, [client, repository]);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    mode: 'supabase',
    currentUser,
    selectableUsers: [],
    selectUser: () => undefined,
    signOut: async () => { await client.auth.signOut(); },
  }), [client, currentUser, status]);

  let content = children;
  if (status === 'loading') {
    content = <main className="auth-status"><h1>正在验证身份</h1><p>请稍候。</p></main>;
  } else if (status === 'signed_out') {
    content = <main className="auth-status"><h1>登录 Northstar OKR</h1><p>请使用组织账户登录。</p></main>;
  } else if (status === 'unassigned') {
    content = <main className="auth-status"><h1>等待管理员分配</h1><p>账户已登录，但尚未分配组织角色。</p></main>;
  }

  return <AuthContext.Provider value={value}>{content}</AuthContext.Provider>;
}
