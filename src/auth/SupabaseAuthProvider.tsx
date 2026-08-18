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
// clears the hash asynchronously, so we snapshot it synchronously on the first
// render — before any network round-trip.
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
  // Reason for an `invite_failed` page: an invalid/expired/used link, or a
  // provisioning error (a valid callback whose application profile/role cannot
  // be resolved). They render different safe messages but never expose tokens.
  const [setupFailure, setSetupFailure] = useState<'expired' | 'provisioning'>();
  const requestVersion = useRef(0);
  // Snapshot the setup candidate once, synchronously, before gotrue can consume
  // or clear the URL hash. Immutable for the lifetime of this mount.
  const setupCandidate = useRef(readInviteCandidate()).current;
  // While true, the setup flow owns the status and every auth event except
  // SIGNED_OUT is ignored: normal profile/role resolution (ready / unassigned /
  // inactive / the dashboard) is frozen until the callback reaches a definitive
  // outcome and, if it succeeds, until password setup completes. Only SIGNED_OUT
  // and the password-setup transaction's explicit completion clear this.
  const setupHold = useRef(setupCandidate);
  // The latest loadSession(), exposed so the password-setup completion path can
  // re-resolve the session/profile through the normal path after onboarding
  // succeeds (rather than waiting for another auth event).
  const loadSessionRef = useRef<(session: SessionLike | null) => Promise<void>>(async () => {});
  const [locale, setLocale] = useState<Locale>(readStoredLocale);

  useLayoutEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    let mounted = true;

    // Resolve the normal (non-setup) profile/role path. This is the only place
    // that reaches `getCurrentProfile` for an already-provisioned identity; a
    // candidate setup callback is deliberately frozen out of this path until it
    // reaches a definitive outcome.
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
      // SIGNED_OUT is a genuine user action and always wins: leave setup mode
      // and return to the login form.
      if (event === 'SIGNED_OUT') {
        setupHold.current = false;
        setSetupFailure(undefined);
        void loadSession(null);
        return;
      }
      // While the setup flow owns the status (a candidate callback is resolving,
      // awaiting password setup, or has failed with a definitive error page), no
      // other auth event may re-resolve the normal profile/dashboard. This makes
      // the outcome independent of whether SIGNED_IN / INITIAL_SESSION /
      // PASSWORD_RECOVERY arrive before or after initialize() settles, and
      // prevents a stale previous-user session from ever replacing it.
      if (setupHold.current) {
        return;
      }
      void loadSession(session);
    });

    // The provider is the single owner of auth initialization. The browser
    // client is constructed with `skipAutoInitialize: true`, so the GoTrueClient
    // constructor never starts initialization — this is the first and only call.
    // It runs AFTER onAuthStateChange above, so no event can be emitted before
    // the subscription is installed.
    const initialize = client.auth.initialize;
    if (!initialize) {
      void client.auth.getSession().then(({ data: sessionData, error: sessionError }) => {
        if (!mounted) return;
        void loadSession(sessionError ? null : sessionData.session);
      });
    } else {
      void (async () => {
        // Authoritative initialization outcome, independent of auth-event
        // ordering. gotrue's initialize() returns `{ error: null }` iff it
        // successfully exchanged a URL callback (and, for a valid implicit
        // callback, REPLACED any stored session with the invitee session
        // produced by that callback). A non-null error means the callback failed
        // (invalid / expired / reused / forged) and any pre-existing session was
        // preserved untouched.
        let error: { message: string } | null;
        try {
          ({ error } = await initialize());
        } catch {
          error = { message: 'auth initialization failed' };
        }
        if (!mounted) return;

        if (!setupCandidate) {
          // No setup callback: resolve the normal path.
          const { data: sessionData, error: sessionError } = await client.auth.getSession();
          if (!mounted) return;
          void loadSession(sessionError ? null : sessionData.session);
          return;
        }

        // A setup candidate is present. Decide a definitive outcome.
        if (error) {
          // Invalid / expired / reused / forged callback. Never fall through to
          // a stale previous-user session or to normal login — show the explicit
          // expired-invitation page.
          setSetupFailure('expired');
          setStatus('invite_failed');
          return;
        }

        // Valid callback: the current session IS the invitee session established
        // by this callback (gotrue overwrote any prior session). Fetch it and
        // verify the application identity.
        const { data: sessionData, error: sessionError } = await client.auth.getSession();
        if (!mounted) return;
        const session = sessionError ? null : sessionData.session;
        if (!session) {
          // A valid callback always yields a session; treat its absence as an
          // unusable/expired link rather than falling through.
          setSetupFailure('expired');
          setStatus('invite_failed');
          return;
        }

        // Resolve the authoritative application profile/role (the database is
        // the source of truth, NOT raw_user_metadata on the auth user).
        const result = await repository.getCurrentProfile();
        if (!mounted) return;
        if (!result.ok || result.data.kind === 'unassigned') {
          // A properly administrator-invited user already has a profile + role
          // before the invitation is usable. A valid callback whose profile/role
          // cannot be found is therefore a PROVISIONING error, never normal
          // "waiting for administrator assignment".
          setSetupFailure('provisioning');
          setStatus('invite_failed');
          return;
        }
        if (result.data.kind === 'inactive') {
          // Deactivated before acceptance: the callback may authenticate, but
          // the account must NOT become active. Deny safely; setting a password
          // must never reactivate it.
          setCurrentUser(undefined);
          setEmail(session.user.email);
          setStatus('inactive');
          return;
        }
        // Active invitee with a valid callback session: enter account setup.
        setEmail(session.user.email);
        setStatus('invite_pending');
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
              // Onboarding is now durable. Release setup mode and re-resolve the
              // session/profile through the normal path (which reads
              // onboarding_completed=true and the authoritative DB role) instead
              // of waiting for another auth event.
              setupHold.current = false;
              const { data: sessionData, error: sessionError } = await client.auth.getSession();
              await loadSessionRef.current(sessionError ? null : sessionData.session);
              return { error: null };
            } catch (error) {
              return { error: { message: error instanceof Error ? error.message : 'account setup failed' } };
            }
          }}
        />
      </>
    );
  } else if (status === 'invite_failed') {
    const expired = setupFailure === 'expired';
    content = (
      <main className="auth-status">
        {languageSwitcher}
        <h1>{expired ? t('invite.expired') : t('invite.provisioningError')}</h1>
        <p>{expired ? t('invite.expiredDescription') : t('invite.provisioningErrorDescription')}</p>
        <button className="button button--primary" type="button" onClick={() => { void client.auth.signOut(); }}>{t('account.signOut')}</button>
      </main>
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
