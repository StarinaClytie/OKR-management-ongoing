import { Languages } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import type { User } from '../domain/types';
import type { OkrRepository, SessionLike, SupabaseClientLike } from '../data/types';
import { AuthContext, type AuthContextValue } from './AuthContext';
import { InviteAccept } from './InviteAccept';
import { LoginForm } from './LoginForm';
import { readStoredLocale, storeLocale } from '../i18n/LocaleProvider';
import { translate, type Locale } from '../i18n/messages';

export interface SupabaseAuthProviderProps extends PropsWithChildren {
  client: SupabaseClientLike;
  repository: OkrRepository;
}

export function SupabaseAuthProvider({ children, client, repository }: SupabaseAuthProviderProps) {
  const [status, setStatus] = useState<AuthContextValue['status']>('loading');
  const [currentUser, setCurrentUser] = useState<User>();
  const [email, setEmail] = useState<string | undefined>();
  const requestVersion = useRef(0);
  const [locale, setLocale] = useState<Locale>(readStoredLocale);

  useLayoutEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    let mounted = true;

    async function loadSession(session: SessionLike | null) {
      const version = ++requestVersion.current;
      setCurrentUser(undefined);
      setEmail(session?.user.email);
      setLocale(readStoredLocale());
      if (!session) {
        setStatus('signed_out');
        return;
      }
      if (session.user.email_confirmed_at === null) {
        setStatus('invite_pending');
        return;
      }
      setStatus('loading');
      const result = await repository.getCurrentProfile();
      if (!mounted || version !== requestVersion.current) return;
      if (!result.ok) {
        setStatus('unassigned');
        return;
      }
      const state = result.data;
      if (state.kind === 'inactive') {
        setStatus('inactive');
        return;
      }
      if (state.kind === 'unassigned' || state.user.id !== session.user.id) {
        setStatus('unassigned');
        return;
      }
      setCurrentUser(state.user);
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
    email,
    selectableUsers: [],
    selectUser: () => undefined,
    signOut: async () => { await client.auth.signOut(); },
  }), [client, currentUser, email, status]);
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const nextLocale = locale === 'zh-CN' ? 'en' : 'zh-CN';
  const languageLabel = locale === 'zh-CN' ? t('language.switchToEnglish') : t('language.switchToChinese');
  const languageSwitcher = (
    <button className="icon-button language-switcher" type="button" aria-label={languageLabel} title={languageLabel} onClick={() => {
      setLocale(nextLocale);
      storeLocale(nextLocale);
    }}>
      <Languages size={19} aria-hidden="true" />
    </button>
  );

  let content = children;
  if (status === 'loading') {
    content = <main className="auth-status">{languageSwitcher}<h1>{t('auth.verifying')}</h1><p>{t('auth.wait')}</p></main>;
  } else if (status === 'signed_out') {
    content = (
      <>
        {languageSwitcher}
        <LoginForm
          locale={locale}
          signIn={async (email, password) => {
            const { error } = await client.auth.signInWithPassword({ email, password });
            return { error };
          }}
        />
      </>
    );
  } else if (status === 'invite_pending') {
    content = (
      <>
        {languageSwitcher}
        <InviteAccept
          locale={locale}
          email={email}
          setPassword={async (password) => {
            const { error } = await client.auth.updateUser({ password });
            return { error };
          }}
        />
      </>
    );
  } else if (status === 'unassigned') {
    content = <main className="auth-status">{languageSwitcher}<h1>{t('auth.unassigned')}</h1><p>{t('auth.unassignedDescription')}</p></main>;
  } else if (status === 'inactive') {
    content = (
      <main className="auth-status">
        {languageSwitcher}
        <h1>{t('auth.inactive')}</h1>
        <p>{t('auth.inactiveDescription')}</p>
        <button className="button button--primary" type="button" onClick={() => { void client.auth.signOut(); }}>{t('account.signOut')}</button>
      </main>
    );
  }

  return <AuthContext.Provider value={value}>{content}</AuthContext.Provider>;
}
