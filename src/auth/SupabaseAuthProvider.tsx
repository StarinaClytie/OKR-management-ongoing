import { Languages } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import type { User } from '../domain/types';
import type { OkrRepository, SessionLike, SupabaseClientLike } from '../data/types';
import { AuthContext, type AuthContextValue, type SignUpResult } from './AuthContext';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import { PendingApproval } from './PendingApproval';
import { EmailVerificationPending } from './EmailVerificationPending';
import { ForgotPassword } from './ForgotPassword';
import { ResetPassword } from './ResetPassword';
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
  const [view, setView] = useState<'login' | 'register' | 'forgot'>('login');
  const requestVersion = useRef(0);
  const recoveryRef = useRef(false);
  const loadSessionRef = useRef<(session: SessionLike | null) => Promise<void>>(async () => {});
  const [locale, setLocale] = useState<Locale>(readStoredLocale);

  useLayoutEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    let mounted = true;

    // Resolve the normal profile path: signed_out / pending_approval / inactive /
    // account_error / ready. The application database is the single source of
    // truth for the account state and role.
    async function loadSession(session: SessionLike | null) {
      const version = ++requestVersion.current;
      setCurrentUser(undefined);
      setEmail(session?.user.email);
      setLocale(readStoredLocale());
      if (!session) {
        setStatus('signed_out');
        return;
      }
      setStatus('loading');
      const result = await repository.getCurrentProfile();
      if (!mounted || version !== requestVersion.current) return;
      if (!result.ok) {
        setStatus('account_error');
        return;
      }
      const state = result.data;
      if (state.kind === 'pending') {
        setStatus('pending_approval');
        return;
      }
      if (state.kind === 'inactive') {
        setStatus('inactive');
        return;
      }
      if (state.kind === 'error') {
        setStatus('account_error');
        return;
      }
      setCurrentUser(state.user);
      setStatus('ready');
    }
    loadSessionRef.current = loadSession;

    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        recoveryRef.current = false;
        setView('login');
        void loadSession(null);
        return;
      }
      if (event === 'PASSWORD_RECOVERY') {
        // The recovery session is a restricted token, not a full sign-in: do NOT
        // resolve the profile here. ResetPassword owns the UI until the user sets
        // a new password (resetPassword clears recoveryRef).
        recoveryRef.current = true;
        setEmail(session?.user.email);
        setStatus('recovery');
        return;
      }
      void loadSession(session);
    });

    const initialize = client.auth.initialize;
    if (!initialize) {
      void client.auth.getSession().then(({ data: sessionData, error: sessionError }) => {
        if (!mounted) return;
        void loadSession(sessionError ? null : sessionData.session);
      });
    } else {
      void (async () => {
        try {
          await initialize();
        } catch {
          // getSession() below decides the authoritative session.
        }
        if (!mounted) return;
        // A PASSWORD_RECOVERY callback sets recoveryRef during initialize();
        // skip the normal session→profile resolution so the recovery screen is
        // not clobbered by getCurrentProfile (the recovery token cannot authorize it).
        if (recoveryRef.current) return;
        const { data: sessionData, error: sessionError } = await client.auth.getSession();
        if (!mounted) return;
        void loadSession(sessionError ? null : sessionData.session);
      })();
    }

    return () => {
      mounted = false;
      requestVersion.current += 1;
      data.subscription.unsubscribe();
    };
  }, [client, repository]);

  const signUp = async (displayName: string, emailValue: string, password: string): Promise<SignUpResult> => {
    const { error } = await client.auth.signUp({
      email: emailValue,
      password,
      options: { data: { display_name: displayName } },
    });
    if (error) return { error };

    // Create the pending profile (idempotent). A failed profile write is
    // non-fatal here: it resolves to account_error, and the user can sign out
    // and retry. Only a signed-in session can create a profile.
    const sessionResult = await client.auth.getSession();
    if (sessionResult.data.session) {
      await (client.rpc('create_pending_profile', { p_display_name: displayName }) as Promise<unknown>);
      await loadSessionRef.current(sessionResult.data.session);
      return { error: null };
    }

    // Email confirmation is enabled: signUp returns no session. The profile is
    // NOT created here — it is created lazily on first sign-in (missing →
    // create_pending_profile). Show the verification prompt instead.
    setEmail(emailValue);
    setStatus('email_verification_pending');
    return { error: null };
  };

  const refreshProfile = async () => {
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    await loadSessionRef.current(sessionError ? null : sessionData.session);
  };

  const forgotPassword = async (emailValue: string): Promise<{ error: { message: string } | null }> => {
    // Build the redirect from the current origin so it stays correct in local
    // dev (http://localhost:5173) and production (https://okr.trspectra.com).
    const redirectTo = `${window.location.origin}/auth/reset-password`;
    const { error } = await client.auth.resetPasswordForEmail(emailValue, { redirectTo });
    return { error };
  };

  const resetPassword = async (password: string): Promise<{ error: { message: string } | null }> => {
    const { error } = await client.auth.updateUser({ password });
    if (error) return { error };
    // The recovery session is now a full session. Clear the guard and resolve the
    // profile so the provider transitions to ready (and the router, mounted only
    // in ready, lands on /dashboard via the /auth/reset-password route).
    recoveryRef.current = false;
    await refreshProfile();
    return { error: null };
  };

  const value = useMemo<AuthContextValue>(() => ({
    status,
    mode: 'supabase',
    currentUser,
    email,
    selectableUsers: [],
    selectUser: () => undefined,
    signOut: async () => { await client.auth.signOut(); },
    signUp,
    refreshProfile,
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
        {view === 'register' ? (
          <RegisterForm
            locale={locale}
            onSubmit={signUp}
            onBack={() => setView('login')}
          />
        ) : view === 'forgot' ? (
          <ForgotPassword
            locale={locale}
            onSubmit={forgotPassword}
            onBack={() => setView('login')}
          />
        ) : (
          <LoginForm
            locale={locale}
            signIn={async (emailValue, password) => {
              const { error } = await client.auth.signInWithPassword({ email: emailValue, password });
              return { error };
            }}
            onRegister={() => setView('register')}
            onForgotPassword={() => setView('forgot')}
          />
        )}
      </>
    );
  } else if (status === 'recovery') {
    content = (
      <>
        {languageSwitcher}
        <ResetPassword
          locale={locale}
          onSubmit={resetPassword}
          onBack={() => { void value.signOut(); }}
        />
      </>
    );
  } else if (status === 'email_verification_pending') {
    content = (
      <>
        {languageSwitcher}
        <EmailVerificationPending
          locale={locale}
          email={email}
          onBack={() => {
            setStatus('signed_out');
            setView('login');
          }}
        />
      </>
    );
  } else if (status === 'pending_approval') {
    content = (
      <>
        {languageSwitcher}
        <PendingApproval
          locale={locale}
          email={email}
          onRefresh={refreshProfile}
          onSignOut={() => { void value.signOut(); }}
        />
      </>
    );
  } else if (status === 'inactive') {
    content = (
      <main className="auth-status">
        {languageSwitcher}
        <h1>{t('auth.inactive')}</h1>
        <p>{t('auth.inactiveDescription')}</p>
        <button className="button button--primary" type="button" onClick={() => { void value.signOut(); }}>{t('account.signOut')}</button>
      </main>
    );
  } else if (status === 'account_error') {
    content = (
      <main className="auth-status">
        {languageSwitcher}
        <h1>{t('auth.accountError')}</h1>
        <p>{t('auth.accountErrorDescription')}</p>
        <button className="button button--primary" type="button" onClick={() => { void value.signOut(); }}>{t('account.signOut')}</button>
      </main>
    );
  }

  return <AuthContext.Provider value={value}>{content}</AuthContext.Provider>;
}
