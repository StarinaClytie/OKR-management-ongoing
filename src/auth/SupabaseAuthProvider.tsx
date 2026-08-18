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

// The admin invite / resend edge functions send Supabase emails with
// `redirect_to = <origin>/auth/invite`. When the recipient clicks the link,
// Supabase verifies it and redirects the browser back to `/auth/invite`. This
// app uses Supabase's default *implicit* flow (createClient is not given a
// flowType, and the edge functions use the stock `auth.admin.inviteUserByEmail`
// / `auth.resetPasswordForEmail`), so a genuine callback lands as a hash
// fragment:
//
//   /auth/invite#access_token=…&expires_in=…&refresh_token=…&token_type=bearer&type=invite
//   /auth/invite#access_token=…&expires_in=…&refresh_token=…&token_type=bearer&type=recovery
//
// Two callback kinds reach the same password-setup form:
//   - `type=invite`   — a never-confirmed invitee;
//   - `type=recovery` — a confirmed-but-incomplete user sent a password-setup
//                       email via `resetPasswordForEmail`.
//
// gotrue's `detectSessionInUrl` (enabled by default) consumes that payload and
// clears it asynchronously, so we snapshot it synchronously on the first render —
// before any network round-trip.
//
// This snapshot is only a CANDIDATE setup arrival, never proof of one. To be a
// candidate it must carry the complete token set gotrue itself requires before
// it will build a session (GoTrueClient._getSessionFromURL requires access_token,
// refresh_token, expires_in AND token_type) and a `type` of `invite` or
// `recovery`. Anything less is deliberately NOT a candidate, because a bare
// `?code=` (PKCE — which this app does not use), a partial `#access_token=`, a
// stale/expired link, or a normal session-recovery load must never reach the
// setup state machine.
function readInviteCandidate(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.pathname !== '/auth/invite') return false;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const expiresIn = params.get('expires_in');
  const tokenType = params.get('token_type');
  const type = params.get('type');
  return (
    (type === 'invite' || type === 'recovery') &&
    Boolean(accessToken) &&
    Boolean(refreshToken) &&
    Boolean(expiresIn) &&
    Boolean(tokenType)
  );
}

export function SupabaseAuthProvider({ children, client, repository }: SupabaseAuthProviderProps) {
  const [status, setStatus] = useState<AuthContextValue['status']>('loading');
  const [currentUser, setCurrentUser] = useState<User>();
  const [email, setEmail] = useState<string | undefined>();
  const requestVersion = useRef(0);
  // Did the browser arrive at `/auth/invite` carrying a *complete* implicit
  // invite callback (type=invite + the full token set)? This is only a candidate:
  // an expired/reused token with the same shape also matches here and is
  // distinguished later by initialize()'s error (or the absence of SIGNED_IN).
  const inviteCandidate = useRef(readInviteCandidate());
  // The authoritative outcome of Supabase's initialization for the candidate
  // callback, as returned by client.auth.initialize():
  //   - 'succeeded' → initialize() resolved with { error: null }, so Supabase
  //                   actually processed the URL callback (it saved the invitee
  //                   session and will emit SIGNED_IN). This is what lets a
  //                   subsequent SIGNED_IN validate the candidate.
  //   - 'failed'    → initialize() resolved with { error }, so the callback was
  //                   invalid / expired / reused / forged; Supabase preserved any
  //                   pre-existing session and emitted no SIGNED_IN.
  //   - undefined   → the callback is still unresolved; nothing may be resolved
  //                   against the normal profile/role path yet.
  const inviteResolution = useRef<'succeeded' | 'failed' | undefined>(undefined);
  // Authoritative proof the candidate callback was real: set only when Supabase
  // emits SIGNED_IN with a session while the candidate is still open AND
  // initialize() already reported 'succeeded'. A failed callback falls back to
  // any pre-existing session WITHOUT emitting SIGNED_IN, so this stays false and
  // no password setup is exposed.
  const inviteValidated = useRef(false);
  // True while a password-setup transaction (updateUser + complete_onboarding)
  // is in flight. A successful updateUser emits USER_UPDATED — possibly
  // synchronously, before updateUser even resolves — and that event must NOT
  // clear the one-shot invite flags: onboarding is only complete once the
  // complete_onboarding RPC has persisted onboarding_completed. This flag makes
  // the state machine explicit instead of relying on event timing.
  const onboardingCompletionInProgress = useRef(false);
  // The latest loadSession(), exposed so the password-setup completion path can
  // re-resolve the session/profile through the normal profile/role path after
  // onboarding succeeds (rather than waiting for another auth event).
  const loadSessionRef = useRef<(session: SessionLike | null) => Promise<void>>(async () => {});
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
        // A candidate invite callback must not resolve to a signed-out state
        // while the callback is still unresolved (or succeeded but its SIGNED_IN
        // session has not arrived yet). Hold "verifying"; the initialize()
        // driver exits invite mode on failure.
        if (inviteCandidate.current) {
          setStatus('loading');
          return;
        }
        inviteCandidate.current = false;
        inviteValidated.current = false;
        setStatus('signed_out');
        return;
      }
      // Invitation acceptance is driven by the invite route, NOT by
      // `email_confirmed_at === null`: Supabase confirms the email when the
      // invite link is verified, so `email_confirmed_at` is already set by the
      // time the browser lands here.
      //
      // A candidate callback URL plus a session is NOT enough to enter the
      // password-setup flow: a failed callback leaves a pre-existing session in
      // place without emitting SIGNED_IN. Only a session established by a
      // SIGNED_IN event (inviteValidated) exposes InviteAccept. Until that
      // confirmation arrives, keep verifying instead of resolving the normal
      // profile/role path (which could briefly render a pre-existing session).
      if (inviteCandidate.current) {
        if (inviteValidated.current) {
          setStatus('invite_pending');
          return;
        }
        setStatus('loading');
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
    loadSessionRef.current = loadSession;

    const { data } = client.auth.onAuthStateChange((event, session) => {
      // The authoritative proof of a real invite/setup callback: after
      // initialize() resolves successfully, Supabase emits SIGNED_IN with the
      // freshly established session (deferred via setTimeout). It does NOT emit
      // this on a failed exchange (forged/expired/reused token), where it
      // silently keeps any pre-existing session instead. Gating on `succeeded`
      // also keeps a pre-existing session (re-auth / session recovery emits
      // SIGNED_IN too) from validating a candidate that never initialized.
      if (event === 'SIGNED_IN' && session && inviteCandidate.current && inviteResolution.current === 'succeeded') {
        inviteValidated.current = true;
      }
      // Completing the invite (a successful password update emits USER_UPDATED)
      // or signing out clears the one-shot invite flags so the next load resolves
      // the normal profile/role path instead of re-entering the invite form.
      //
      // Exception: a USER_UPDATED emitted while a password-setup transaction is
      // in flight (updateUser + complete_onboarding) must NOT clear the flags —
      // onboarding is only complete once the RPC succeeds. Clearing here would
      // let the normal profile/dashboard render before onboarding_completed is
      // persisted. SIGNED_OUT still clears unconditionally, and USER_UPDATED
      // outside an in-flight setup keeps its existing behavior.
      if (event === 'SIGNED_OUT') {
        inviteCandidate.current = false;
        inviteValidated.current = false;
      } else if (event === 'USER_UPDATED' && !onboardingCompletionInProgress.current) {
        inviteCandidate.current = false;
        inviteValidated.current = false;
      }
      void loadSession(session);
    });

    // The provider is the single owner of auth initialization. The browser
    // client is constructed with `skipAutoInitialize: true`, so the GoTrueClient
    // constructor never starts initialization — this is the first and only call.
    // It runs AFTER onAuthStateChange above, so no SIGNED_IN / INITIAL_SESSION /
    // SIGNED_OUT event can be emitted before the subscription is installed.
    //
    // A candidate invite callback must not resolve any session until Supabase's
    // initialization has produced a definitive outcome:
    //   - `{ error }`      → the callback failed (invalid/expired/reused/forged);
    //                        Supabase preserved any prior session and emitted no
    //                        SIGNED_IN.
    //   - `{ error: null }` → the callback succeeded; the invitee session is
    //                        delivered by the deferred SIGNED_IN event.
    const initialize = client.auth.initialize;
    if (!initialize) {
      void client.auth.getSession().then(({ data, error }) => {
        if (!mounted) return;
        void loadSession(error ? null : data.session);
      });
    } else {
      void (async () => {
        let error: { message: string } | null;
        try {
          ({ error } = await initialize());
        } catch {
          error = { message: 'auth initialization failed' };
        }
        if (!mounted) return;
        if (inviteCandidate.current) {
          if (error) {
            inviteResolution.current = 'failed';
            inviteCandidate.current = false;
            inviteValidated.current = false;
          } else {
            inviteResolution.current = 'succeeded';
          }
        }
        void client.auth.getSession().then(({ data: sessionData, error: sessionError }) => {
          if (!mounted) return;
          void loadSession(sessionError ? null : sessionData.session);
        });
      })();
    }
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
            // Flag the transaction BEFORE updateUser: a successful password
            // write emits USER_UPDATED (possibly synchronously, inside
            // updateUser) and that event must not exit invite mode. Onboarding
            // is complete only after BOTH the password write and the
            // complete_onboarding RPC have succeeded.
            onboardingCompletionInProgress.current = true;
            try {
              const { error } = await client.auth.updateUser({ password });
              if (error) return { error };
              // Mark the caller's own onboarding complete. complete_onboarding()
              // is a SECURITY DEFINER RPC scoped to auth.uid(), so the browser
              // can only ever complete its own profile — never another user's.
              // Supabase RPC resolves with { data, error } rather than rejecting
              // on a database failure, so the error must be inspected here.
              const rpcResult = await (client.rpc('complete_onboarding') as Promise<{
                data: unknown;
                error: { code?: string; message: string } | null;
              }>);
              if (rpcResult.error) return { error: rpcResult.error };
              // Onboarding is now durable. Explicitly leave invite/setup mode and
              // re-resolve the session/profile through the normal path (which
              // reads onboarding_completed=true) instead of waiting for another
              // auth event.
              inviteCandidate.current = false;
              inviteValidated.current = false;
              const { data: sessionData, error: sessionError } = await client.auth.getSession();
              await loadSessionRef.current(sessionError ? null : sessionData.session);
              return { error: null };
            } catch (error) {
              return { error: { message: error instanceof Error ? error.message : 'account setup failed' } };
            } finally {
              onboardingCompletionInProgress.current = false;
            }
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
