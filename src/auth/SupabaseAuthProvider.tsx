import { Languages } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import type { User } from '../domain/types';
import type { OkrRepository, SessionLike, SupabaseClientLike } from '../data/types';
import { AuthContext, type AuthContextValue } from './AuthContext';
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
      setLocale(readStoredLocale());
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
          signIn={async (email, password) => {
            const { error } = await client.auth.signInWithPassword({ email, password });
            return { error };
          }}
        />
      </>
    );
  } else if (status === 'unassigned') {
    content = <main className="auth-status">{languageSwitcher}<h1>{t('auth.unassigned')}</h1><p>{t('auth.unassignedDescription')}</p></main>;
  }

  return <AuthContext.Provider value={value}>{content}</AuthContext.Provider>;
}
