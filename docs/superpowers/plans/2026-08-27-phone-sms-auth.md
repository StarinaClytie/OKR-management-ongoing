# Phone and SMS Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `+86` phone registration, phone/password login, SMS OTP login, phone binding, and phone password recovery while preserving all existing email authentication and administrator approval behavior.

**Architecture:** Alibaba Cloud managed RDS Supabase Auth remains the identity authority and uses its native Alibaba Cloud SMS Provider. The React auth provider exposes provider-neutral phone operations, PostgreSQL mirrors only Auth-confirmed phone identities into `profiles.phone`, and feature flags keep all phone entry points hidden until SMS is operational. Existing UUID-based profiles, approval rules, RLS, and email flows remain intact.

**Tech Stack:** React 19, TypeScript, Vite, `@supabase/supabase-js` 2.x, Vitest/Testing Library, PostgreSQL 17, pgTAP, Alibaba Cloud managed RDS Supabase Auth.

## Global Constraints

- First release supports only mainland China `+86` mobile numbers and stores verified numbers in E.164 form such as `+8613812345678`.
- Login offers phone/password, SMS OTP, and email/password; phone/password is the default when phone auth is enabled.
- SMS OTP login must always call `signInWithOtp` with `shouldCreateUser: false`.
- New phone users remain `pending` until an administrator approves them.
- Existing email users bind a phone to the same Auth UUID; never create a second profile.
- `auth.users.phone` is authoritative; browser input can never mark a phone verified.
- `profiles.phone` contains only verified identity; `profiles.pending_phone` is an administrator-entered candidate and never authenticates.
- OTP values never enter application tables, logs, analytics, local storage, or error reports.
- Alibaba Cloud AK/SK exist only in managed RDS Supabase Auth configuration and never in source, Git, server env, database, or `VITE_*`.
- `VITE_PHONE_AUTH_ENABLED` and `VITE_PHONE_REGISTRATION_ENABLED` default to `false`; registration cannot be enabled when auth is disabled.
- Do not edit historical migrations; add `202608270008_phone_auth.sql` as a forward migration.

---

## File Structure

**Create**

- `src/auth/phone.ts` — pure `+86` validation, normalization, formatting, masking, and feature-flag parsing.
- `src/auth/authErrors.ts` — provider error to stable UI error-code mapping without identity disclosure.
- `src/auth/SmsCodeInput.tsx` — OTP input, resend button, and countdown UI only.
- `src/auth/PhoneVerificationPending.tsx` — phone registration verification screen.
- `src/auth/BindPhonePanel.tsx` — current-user phone binding interaction.
- `src/auth/PhonePasswordRecovery.tsx` — phone OTP verification followed by password reset.
- `supabase/migrations/202608270008_phone_auth.sql` — profile phone columns, verified-phone sync RPC, and phone-aware profile/list RPCs.
- `supabase/tests/phone_auth.test.sql` — pgTAP authorization, uniqueness, sync, and phone-only profile tests.

**Modify**

- `src/data/types.ts` — Auth client phone overloads, session phone field, repository/user data contracts.
- `src/data/supabaseRepository.ts` — map phone fields and expose verified-phone sync/candidate update RPCs.
- `src/data/demoRepository.ts` — satisfy the expanded repository interface without pretending demo mode performs SMS.
- `src/auth/AuthContext.tsx` — expose identity fields and phone auth operations.
- `src/auth/SupabaseAuthProvider.tsx` — orchestrate email and phone auth flows.
- `src/auth/LoginForm.tsx` — three login tabs.
- `src/auth/RegisterForm.tsx` — phone-first registration plus retained email registration.
- `src/auth/ForgotPassword.tsx` — email/phone recovery chooser.
- `src/auth/ResetPassword.tsx` — shared final password update UI.
- `src/pages/ProfilePage.tsx` — verified phone display and binding entry.
- `src/pages/UsersPage.tsx` and `src/components/UserFormModal.tsx` — phone columns and `pending_phone` administration.
- `src/layout/AccountMenu.tsx` — masked phone fallback identity.
- `src/i18n/messages.ts` and `src/styles/global.css` — bilingual copy and auth controls.
- `src/lib/supabase.ts`, `.env.example`, `.env.production.example`, `scripts/verify-supabase-config.mjs` — feature flags.
- Corresponding existing test files next to every modified TypeScript/TSX file.
- `docs/PROJECT_HANDOVER.md` and `docs/supabase-setup.md` — authentication and rollout runbook.

---

### Task 1: Phone Domain Utilities and Feature Flags

**Files:**
- Create: `src/auth/phone.ts`
- Create: `src/auth/phone.test.ts`
- Modify: `src/lib/supabase.ts`
- Modify: `scripts/verify-supabase-config.mjs`
- Modify: `scripts/verify-supabase-config.test.mjs`
- Modify: `.env.example`
- Modify: `.env.production.example`

**Interfaces:**
- Produces: `normalizeMainlandPhone(input: string): string | null`
- Produces: `toNationalPhone(e164: string): string`
- Produces: `maskPhone(e164: string): string`
- Produces: `readBooleanFlag(value: string | undefined): boolean`
- Produces: `phoneAuthEnabled: boolean` and `phoneRegistrationEnabled: boolean`

- [ ] **Step 1: Write failing pure-function tests**

```ts
import { describe, expect, it } from 'vitest';
import { maskPhone, normalizeMainlandPhone, readBooleanFlag, toNationalPhone } from './phone';

describe('mainland phone identity', () => {
  it.each([
    ['13812345678', '+8613812345678'],
    ['+8613812345678', '+8613812345678'],
    [' 138 1234 5678 ', '+8613812345678'],
  ])('normalizes %s', (input, expected) => expect(normalizeMainlandPhone(input)).toBe(expected));

  it.each(['1381234567', '12812345678', '+441234567890', ''])('rejects %s', (input) => {
    expect(normalizeMainlandPhone(input)).toBeNull();
  });

  it('formats without leaking the full number', () => {
    expect(toNationalPhone('+8613812345678')).toBe('13812345678');
    expect(maskPhone('+8613812345678')).toBe('138****5678');
  });

  it('accepts only an explicit true feature flag', () => {
    expect(readBooleanFlag('true')).toBe(true);
    expect(readBooleanFlag(undefined)).toBe(false);
    expect(readBooleanFlag('false')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `npm run test:run -- src/auth/phone.test.ts scripts/verify-supabase-config.test.mjs`

Expected: FAIL because `src/auth/phone.ts` and flag validation do not exist.

- [ ] **Step 3: Implement the utilities and exported flags**

```ts
const MAINLAND_PHONE = /^1[3-9]\d{9}$/;

export function normalizeMainlandPhone(input: string): string | null {
  const compact = input.replace(/[\s-]/g, '');
  const national = compact.startsWith('+86') ? compact.slice(3) : compact;
  return MAINLAND_PHONE.test(national) ? `+86${national}` : null;
}

export function toNationalPhone(e164: string): string {
  return e164.startsWith('+86') ? e164.slice(3) : e164;
}

export function maskPhone(e164: string): string {
  const value = toNationalPhone(e164);
  return MAINLAND_PHONE.test(value) ? `${value.slice(0, 3)}****${value.slice(-4)}` : '';
}

export function readBooleanFlag(value: string | undefined): boolean {
  return value === 'true';
}
```

In `src/lib/supabase.ts`, export flags and force registration off when auth is off:

```ts
export const phoneAuthEnabled = readBooleanFlag(import.meta.env.VITE_PHONE_AUTH_ENABLED);
export const phoneRegistrationEnabled = phoneAuthEnabled
  && readBooleanFlag(import.meta.env.VITE_PHONE_REGISTRATION_ENABLED);
```

Extend production config validation so only `true`, `false`, or absence is accepted and so registration-without-auth is rejected. Add both flags with `false` to both env examples.

- [ ] **Step 4: Run focused tests and config verification**

Run: `npm run test:run -- src/auth/phone.test.ts scripts/verify-supabase-config.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth/phone.ts src/auth/phone.test.ts src/lib/supabase.ts scripts/verify-supabase-config.mjs scripts/verify-supabase-config.test.mjs .env.example .env.production.example
git commit -m "feat: define phone auth formats and feature flags"
```

---

### Task 2: Phone-Aware Database Identity Mirror

**Files:**
- Create: `supabase/migrations/202608270008_phone_auth.sql`
- Create: `supabase/tests/phone_auth.test.sql`

**Interfaces:**
- Produces columns: `profiles.phone text`, `profiles.phone_verified_at timestamptz`, `profiles.pending_phone text`
- Produces RPC: `public.sync_my_verified_phone() returns jsonb`
- Produces RPC: `public.set_user_pending_phone(p_target_user_id uuid, p_pending_phone text) returns void`
- Replaces: `public.create_pending_profile(text)` and `public.list_organization_users()` with phone-aware canonical definitions

- [ ] **Step 1: Write failing pgTAP coverage**

Create fixtures for a phone-only pending user, an existing email user, an administrator, and a second organization. Assert:

```sql
select has_column('public', 'profiles', 'phone');
select has_column('public', 'profiles', 'phone_verified_at');
select has_column('public', 'profiles', 'pending_phone');
select function_returns('public', 'sync_my_verified_phone', array[]::text[], 'jsonb');

select lives_ok(
  $$ select public.create_pending_profile('手机用户') $$,
  'phone-only authenticated user can create a pending profile'
);

select is(
  (select email from public.profiles where id = auth.uid()),
  '',
  'phone-only profile keeps the legacy empty email representation'
);

select throws_ok(
  $$ select public.set_user_pending_phone('00000000-0000-0000-0000-000000000099', '+8613812345678') $$,
  '42501',
  'administrator cannot write another organization candidate phone'
);
```

Also assert `sync_my_verified_phone()` ignores caller input, reads `auth.users.phone`, sets `phone_verified_at`, clears a matching `pending_phone`, rejects unauthenticated calls, and that duplicate verified phone values fail with `23505`.

- [ ] **Step 2: Run the database test and verify failure**

Run: `npx supabase test db supabase/tests/phone_auth.test.sql`

Expected: FAIL because the columns and RPCs do not exist.

- [ ] **Step 3: Implement the forward migration**

The migration must:

```sql
alter table public.profiles
  add column if not exists phone text,
  add column if not exists phone_verified_at timestamptz,
  add column if not exists pending_phone text;

create unique index if not exists profiles_verified_phone_unique
  on public.profiles (phone)
  where phone is not null;

alter table public.profiles
  add constraint profiles_phone_e164_check
  check (phone is null or phone ~ '^\\+861[3-9][0-9]{9}$') not valid;

alter table public.profiles validate constraint profiles_phone_e164_check;
```

Use the same E.164 check for `pending_phone`. `sync_my_verified_phone()` must be `SECURITY DEFINER`, `set search_path = ''`, require `auth.uid()`, read the caller's `phone` and `phone_confirmed_at` from `auth.users`, reject an absent/unconfirmed phone, update only `profiles.id = auth.uid()`, and return:

```json
{"phone":"+8613812345678","phoneVerifiedAt":"..."}
```

`set_user_pending_phone` must require an administrator in the target's organization, accept `null`/empty to clear, normalize only already-E.164 values, and never touch `profiles.phone` or `phone_verified_at`.

Recreate `create_pending_profile` so fallback name order is explicit display name → metadata display name → email local-part → masked Auth phone → `User`. Recreate `list_organization_users` by copying its current canonical body and adding `phone`, `phone_verified_at`, and `pending_phone` to every role branch. Revoke public/anon access and grant only the required RPC execution to `authenticated`; finish with `notify pgrst, 'reload schema';`.

- [ ] **Step 4: Reset and run focused database tests**

Run: `npx supabase db reset && npx supabase test db supabase/tests/phone_auth.test.sql supabase/tests/user_lifecycle.test.sql supabase/tests/admin_users.test.sql supabase/tests/rls.test.sql`

Expected: PASS.

- [ ] **Step 5: Run the full pgTAP suite**

Run: `npx supabase test db`

Expected: all database tests pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/202608270008_phone_auth.sql supabase/tests/phone_auth.test.sql
git commit -m "feat: mirror verified phone identities in profiles"
```

---

### Task 3: Expand Auth and Repository Contracts

**Files:**
- Modify: `src/data/types.ts`
- Modify: `src/data/supabaseRepository.ts`
- Modify: `src/data/supabaseRepository.test.ts`
- Modify: `src/data/demoRepository.ts`
- Modify: `src/auth/AuthContext.tsx`
- Modify: `src/auth/AuthContext.test.tsx`

**Interfaces:**
- Produces auth methods with discriminated credentials for email or phone
- Produces `OrganizationUser.phone`, `phoneVerifiedAt`, and `pendingPhone`
- Produces repository methods `syncMyVerifiedPhone()` and `setUserPendingPhone(userId, phone)`

- [ ] **Step 1: Write failing contract/mapping tests**

Add a repository response containing snake-case phone fields and expect:

```ts
expect(result).toEqual({
  ok: true,
  data: [expect.objectContaining({
    phone: '+8613812345678',
    phoneVerifiedAt: '2026-08-27T08:00:00Z',
    pendingPhone: '',
  })],
});
```

Assert RPC calls:

```ts
expect(rpc).toHaveBeenCalledWith('sync_my_verified_phone', {});
expect(rpc).toHaveBeenCalledWith('set_user_pending_phone', {
  p_target_user_id: 'u1',
  p_pending_phone: '+8613912345678',
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm run test:run -- src/data/supabaseRepository.test.ts src/auth/AuthContext.test.tsx`

Expected: FAIL due to missing fields and methods.

- [ ] **Step 3: Extend exact TypeScript contracts**

Extend `SessionLike.user`:

```ts
user: {
  id: string;
  email?: string;
  phone?: string;
  email_confirmed_at?: string | null;
  phone_confirmed_at?: string | null;
}
```

Add Auth methods matching Supabase JS:

```ts
signInWithPassword(credentials:
  | { email: string; password: string }
  | { phone: string; password: string }
): Promise<AuthResponse>;

signUp(credentials:
  | { email: string; password: string; options?: AuthOptions }
  | { phone: string; password: string; options?: AuthOptions & { channel?: 'sms' } }
): Promise<AuthResponse>;

signInWithOtp(credentials: {
  phone: string;
  options: { shouldCreateUser: false; channel?: 'sms' };
}): Promise<{ data: { messageId?: string } | null; error: AuthError | null }>;

verifyOtp(input: {
  phone: string;
  token: string;
  type: 'sms' | 'phone_change';
}): Promise<AuthResponse>;

updateUser(attributes: { password?: string; phone?: string }): Promise<UserResponse>;
```

Add `phone`, `phoneVerifiedAt`, and `pendingPhone` to `OrganizationUser`. Add repository methods returning `RepositoryResult<{ phone: string; phoneVerifiedAt: string }>` and `RepositoryResult<void>`. Update demo repository with explicit unsupported/no-op behavior consistent with its existing patterns.

Extend `AuthContextValue` with `phone?: string` and operation signatures, but do not place UI state such as OTP countdown in context.

- [ ] **Step 4: Implement repository mapping and RPC calls**

Map both camelCase and current SQL JSON keys defensively using the repository's existing conversion helpers. Keep all user mutations UUID-based.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npm run test:run -- src/data/supabaseRepository.test.ts src/auth/AuthContext.test.tsx && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/types.ts src/data/supabaseRepository.ts src/data/supabaseRepository.test.ts src/data/demoRepository.ts src/auth/AuthContext.tsx src/auth/AuthContext.test.tsx
git commit -m "feat: add phone identity data contracts"
```

---

### Task 4: Auth Error Mapping and SMS Code Control

**Files:**
- Create: `src/auth/authErrors.ts`
- Create: `src/auth/authErrors.test.ts`
- Create: `src/auth/SmsCodeInput.tsx`
- Create: `src/auth/SmsCodeInput.test.tsx`
- Modify: `src/i18n/messages.ts`
- Modify: `src/styles/global.css`

**Interfaces:**
- Produces `AuthUiErrorCode`
- Produces `mapAuthError(error): AuthUiErrorCode`
- Produces `<SmsCodeInput value onChange onSend sending disabled locale />`

- [ ] **Step 1: Write failing error-security tests**

```ts
expect(mapAuthError({ message: 'User not found' })).toBe('invalid_identity');
expect(mapAuthError({ message: 'Invalid login credentials' })).toBe('invalid_identity');
expect(mapAuthError({ message: 'over_sms_send_rate_limit' })).toBe('rate_limited');
expect(mapAuthError({ message: 'Token has expired' })).toBe('otp_invalid_or_expired');
expect(mapAuthError({ message: 'User already registered' })).toBe('identity_in_use');
```

The first two must produce the same public copy so login does not disclose registration status.

- [ ] **Step 2: Write failing fake-timer component tests**

Verify send invokes `onSend`, starts at 60, disables resend, reaches zero using `vi.advanceTimersByTime(60_000)`, and never displays or logs a full phone number.

- [ ] **Step 3: Run tests and verify failure**

Run: `npm run test:run -- src/auth/authErrors.test.ts src/auth/SmsCodeInput.test.tsx`

Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Implement stable errors and the controlled component**

Use a finite union:

```ts
export type AuthUiErrorCode =
  | 'invalid_identity'
  | 'rate_limited'
  | 'otp_invalid_or_expired'
  | 'identity_in_use'
  | 'password_too_short'
  | 'service_unavailable'
  | 'unknown';
```

`SmsCodeInput` owns only countdown presentation. Its parent owns phone, token, provider requests, and errors. Add exact Chinese and English keys for every union member.

- [ ] **Step 5: Run focused tests**

Run: `npm run test:run -- src/auth/authErrors.test.ts src/auth/SmsCodeInput.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/auth/authErrors.ts src/auth/authErrors.test.ts src/auth/SmsCodeInput.tsx src/auth/SmsCodeInput.test.tsx src/i18n/messages.ts src/styles/global.css
git commit -m "feat: add secure SMS authentication controls"
```

---

### Task 5: Three-Mode Login

**Files:**
- Modify: `src/auth/LoginForm.tsx`
- Modify: `src/auth/LoginForm.test.tsx`
- Modify: `src/auth/SupabaseAuthProvider.tsx`
- Modify: `src/auth/SupabaseAuthProvider.test.tsx`
- Modify: `src/i18n/messages.ts`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: phone utilities, `mapAuthError`, `SmsCodeInput`, feature flags
- Produces LoginForm callbacks `signInWithEmailPassword`, `signInWithPhonePassword`, `sendLoginOtp`, `verifyLoginOtp`

- [ ] **Step 1: Write failing LoginForm tests**

Cover:

```ts
expect(screen.getByRole('tab', { name: '手机号密码' })).toHaveAttribute('aria-selected', 'true');
expect(screen.getByRole('tab', { name: '短信验证码' })).toBeVisible();
expect(screen.getByRole('tab', { name: '邮箱密码' })).toBeVisible();
```

Submit `13812345678` and assert callback receives `+8613812345678`. Switch to email and assert legacy callback behavior. With `phoneAuthEnabled=false`, assert only the existing email form renders.

- [ ] **Step 2: Write failing Provider tests**

Assert exact calls:

```ts
expect(signInWithPassword).toHaveBeenCalledWith({ phone: '+8613812345678', password: 'secret123' });
expect(signInWithOtp).toHaveBeenCalledWith({
  phone: '+8613812345678',
  options: { shouldCreateUser: false, channel: 'sms' },
});
expect(verifyOtp).toHaveBeenCalledWith({ phone: '+8613812345678', token: '123456', type: 'sms' });
```

- [ ] **Step 3: Run tests and verify failure**

Run: `npm run test:run -- src/auth/LoginForm.test.tsx src/auth/SupabaseAuthProvider.test.tsx`

Expected: FAIL with missing tabs/callbacks.

- [ ] **Step 4: Implement login modes**

Use an accessible tablist. Preserve separate form state per mode so switching tabs does not put email into a phone field. On OTP success, rely on `onAuthStateChange` and the existing profile resolution to enforce pending/inactive/ready states.

Do not special-case pending users before OTP verification; Auth establishes identity first, then `getCurrentProfile` applies the existing account state.

- [ ] **Step 5: Run focused and accessibility-facing tests**

Run: `npm run test:run -- src/auth/LoginForm.test.tsx src/auth/SupabaseAuthProvider.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/auth/LoginForm.tsx src/auth/LoginForm.test.tsx src/auth/SupabaseAuthProvider.tsx src/auth/SupabaseAuthProvider.test.tsx src/i18n/messages.ts src/styles/global.css
git commit -m "feat: add phone password and SMS login"
```

---

### Task 6: Phone-First Registration and Approval Transition

**Files:**
- Create: `src/auth/PhoneVerificationPending.tsx`
- Create: `src/auth/PhoneVerificationPending.test.tsx`
- Modify: `src/auth/RegisterForm.tsx`
- Modify: `src/auth/RegisterForm.test.tsx`
- Modify: `src/auth/SupabaseAuthProvider.tsx`
- Modify: `src/auth/SupabaseAuthProvider.test.tsx`
- Modify: `src/i18n/messages.ts`

**Interfaces:**
- Produces `signUpWithPhone(displayName, phone, password)`
- Produces `verifyPhoneRegistration(phone, token)`
- Preserves existing `signUpWithEmail(displayName, email, password)`

- [ ] **Step 1: Write failing registration UI tests**

When both flags are true, assert phone registration is default, name/password/confirm remain required, invalid mainland phones are rejected locally, and email registration is still selectable. When registration flag is false, assert only the legacy email registration path is available.

- [ ] **Step 2: Write failing Provider flow tests**

```ts
expect(signUp).toHaveBeenCalledWith({
  phone: '+8613812345678',
  password: 'secret123',
  options: { channel: 'sms', data: { display_name: '王芳' } },
});

expect(verifyOtp).toHaveBeenCalledWith({
  phone: '+8613812345678',
  token: '123456',
  type: 'sms',
});

expect(rpc).toHaveBeenCalledWith('create_pending_profile', { p_display_name: '王芳' });
```

After verification, expect pending approval UI, not the dashboard.

- [ ] **Step 3: Run tests and verify failure**

Run: `npm run test:run -- src/auth/RegisterForm.test.tsx src/auth/PhoneVerificationPending.test.tsx src/auth/SupabaseAuthProvider.test.tsx`

Expected: FAIL.

- [ ] **Step 4: Implement phone-first registration**

Keep phone/password only in component state until submission. Keep the phone and display name in Provider memory while awaiting OTP; do not persist the password or OTP. Verification calls `create_pending_profile` only after a session exists, then resolves the profile and shows `PendingApproval`.

Preserve the existing no-session email confirmation behavior and `EmailVerificationPending` component unchanged.

- [ ] **Step 5: Run focused tests**

Run: `npm run test:run -- src/auth/RegisterForm.test.tsx src/auth/PhoneVerificationPending.test.tsx src/auth/SupabaseAuthProvider.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/auth/RegisterForm.tsx src/auth/RegisterForm.test.tsx src/auth/PhoneVerificationPending.tsx src/auth/PhoneVerificationPending.test.tsx src/auth/SupabaseAuthProvider.tsx src/auth/SupabaseAuthProvider.test.tsx src/i18n/messages.ts
git commit -m "feat: add verified phone registration"
```

---

### Task 7: Phone Password Recovery

**Files:**
- Create: `src/auth/PhonePasswordRecovery.tsx`
- Create: `src/auth/PhonePasswordRecovery.test.tsx`
- Modify: `src/auth/ForgotPassword.tsx`
- Modify: `src/auth/ForgotPassword.test.tsx`
- Modify: `src/auth/SupabaseAuthProvider.tsx`
- Modify: `src/auth/SupabaseAuthProvider.test.tsx`
- Modify: `src/i18n/messages.ts`

**Interfaces:**
- Produces `sendPhoneRecoveryOtp(phone)` with `shouldCreateUser: false`
- Produces `verifyPhoneRecoveryOtp(phone, token)`
- Consumes existing `resetPassword(password)` final step

- [ ] **Step 1: Write failing recovery tests**

Assert the phone recovery flow sends an OTP without account creation, verifies `type: 'sms'`, transitions to `ResetPassword`, and calls `updateUser({ password })`. Assert email recovery still calls `resetPasswordForEmail` with the existing redirect URL.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm run test:run -- src/auth/ForgotPassword.test.tsx src/auth/PhonePasswordRecovery.test.tsx src/auth/SupabaseAuthProvider.test.tsx src/auth/ResetPassword.test.tsx`

Expected: FAIL because phone recovery is absent.

- [ ] **Step 3: Implement explicit recovery state**

Add Provider state distinguishing `'email_link' | 'phone_otp'`. A verified phone OTP creates a session, but set `recoveryRef.current = true` before verification so the emitted `SIGNED_IN` event cannot route to the dashboard. Only successful `updateUser({ password })` clears recovery mode and then signs out or resolves according to the existing reset contract; tests must lock the chosen behavior to “sign out and return to login” for phone recovery.

- [ ] **Step 4: Run focused tests**

Run: `npm run test:run -- src/auth/ForgotPassword.test.tsx src/auth/PhonePasswordRecovery.test.tsx src/auth/SupabaseAuthProvider.test.tsx src/auth/ResetPassword.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth/PhonePasswordRecovery.tsx src/auth/PhonePasswordRecovery.test.tsx src/auth/ForgotPassword.tsx src/auth/ForgotPassword.test.tsx src/auth/SupabaseAuthProvider.tsx src/auth/SupabaseAuthProvider.test.tsx src/i18n/messages.ts
git commit -m "feat: recover passwords with verified phone OTP"
```

---

### Task 8: Existing-User Phone Binding

**Files:**
- Create: `src/auth/BindPhonePanel.tsx`
- Create: `src/auth/BindPhonePanel.test.tsx`
- Modify: `src/auth/SupabaseAuthProvider.tsx`
- Modify: `src/auth/SupabaseAuthProvider.test.tsx`
- Modify: `src/pages/ProfilePage.tsx`
- Modify: `src/pages/ProfilePage.test.tsx`
- Modify: `src/layout/AccountMenu.tsx`
- Modify: `src/layout/AccountMenu.test.tsx`
- Modify: `src/i18n/messages.ts`

**Interfaces:**
- Produces `requestPhoneBinding(phone)` using `updateUser({ phone })`
- Produces `verifyPhoneBinding(phone, token)` using `verifyOtp(... type: 'phone_change')`
- Consumes `repository.syncMyVerifiedPhone()`

- [ ] **Step 1: Write failing binding tests**

Assert an email-only signed-in user can request binding, verify with `phone_change`, call `sync_my_verified_phone`, retain the same UUID, and display only `138****5678`. Assert a duplicate phone error does not alter the displayed identity.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm run test:run -- src/auth/BindPhonePanel.test.tsx src/pages/ProfilePage.test.tsx src/layout/AccountMenu.test.tsx src/auth/SupabaseAuthProvider.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement binding and identity display**

Provider updates its `phone` state from the refreshed Auth session only after `verifyOtp` succeeds and the database sync RPC succeeds. `AccountMenu` and `ProfilePage` receive a masked phone; neither component formats raw numbers independently.

- [ ] **Step 4: Run focused tests**

Run: `npm run test:run -- src/auth/BindPhonePanel.test.tsx src/pages/ProfilePage.test.tsx src/layout/AccountMenu.test.tsx src/auth/SupabaseAuthProvider.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth/BindPhonePanel.tsx src/auth/BindPhonePanel.test.tsx src/auth/SupabaseAuthProvider.tsx src/auth/SupabaseAuthProvider.test.tsx src/pages/ProfilePage.tsx src/pages/ProfilePage.test.tsx src/layout/AccountMenu.tsx src/layout/AccountMenu.test.tsx src/i18n/messages.ts
git commit -m "feat: bind verified phones to existing accounts"
```

---

### Task 9: Administrator Phone Visibility and Candidate Numbers

**Files:**
- Modify: `src/components/UserFormModal.tsx`
- Modify: `src/components/UserFormModal.test.tsx`
- Modify: `src/pages/UsersPage.tsx`
- Modify: `src/pages/UsersPage.test.tsx`
- Modify: `src/data/supabaseRepository.ts`
- Modify: `src/data/supabaseRepository.test.ts`
- Modify: `src/i18n/messages.ts`

**Interfaces:**
- Consumes `OrganizationUser.phone`, `phoneVerifiedAt`, `pendingPhone`
- Consumes `setUserPendingPhone(userId, phone)`

- [ ] **Step 1: Write failing administrator UI tests**

Assert tables show masked verified phones, show “待本人验证” for `pendingPhone`, and never label a candidate as verified. Editing a candidate must call only `setUserPendingPhone`; it must not call any Auth API or write `profiles.phone`.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm run test:run -- src/components/UserFormModal.test.tsx src/pages/UsersPage.test.tsx src/data/supabaseRepository.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement candidate-number administration**

Extend `UserFormValues` with `pendingPhone`. Normalize a non-empty value before calling the RPC. For users with verified `phone`, render the masked verified value read-only and keep candidate editing separate. Approval remains UUID-based and does not require a phone.

- [ ] **Step 4: Run focused tests**

Run: `npm run test:run -- src/components/UserFormModal.test.tsx src/pages/UsersPage.test.tsx src/data/supabaseRepository.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/UserFormModal.tsx src/components/UserFormModal.test.tsx src/pages/UsersPage.tsx src/pages/UsersPage.test.tsx src/data/supabaseRepository.ts src/data/supabaseRepository.test.ts src/i18n/messages.ts
git commit -m "feat: manage pending employee phone numbers"
```

---

### Task 10: Full Verification, Documentation, and Deployment Gate

**Files:**
- Modify: `docs/PROJECT_HANDOVER.md`
- Modify: `docs/supabase-setup.md`
- Modify: `README.md`
- Test: all existing and new suites

**Interfaces:**
- Documents managed RDS Supabase SMS Provider configuration and two-stage feature enablement
- Produces no application API

- [ ] **Step 1: Add deployment and rollback documentation**

Document the exact order:

```text
1. Back up RDS and confirm instance is Running.
2. Deploy 202608270008 with both phone flags false.
3. Verify existing email registration/login/reset.
4. Configure the dedicated RAM AK/SK, region, approved sign, template, autoconfirm=false, OTP expiry, and public egress in managed RDS Supabase Auth.
5. Wait for the managed instance to return to Running.
6. Test SMS using a test number before changing the frontend flags.
7. Enable VITE_PHONE_AUTH_ENABLED=true and deploy.
8. Verify binding and both phone login modes.
9. Enable VITE_PHONE_REGISTRATION_ENABLED=true and deploy.
10. Verify phone registration → pending → administrator approval.
```

Rollback documentation must say to set both flags false and redeploy; do not drop phone columns, rewrite migration history, or remove email login.

- [ ] **Step 2: Run clean database verification**

Run:

```bash
npx supabase db reset
npx supabase test db
npx supabase db lint --local --level error
```

Expected: reset succeeds, all pgTAP files pass, lint reports no errors.

- [ ] **Step 3: Run complete application verification**

Run:

```bash
npm run test:run
npm run typecheck
npm run build
npm run server:build
```

Expected: all tests and builds pass; only the existing non-blocking Vite chunk-size warning may remain.

- [ ] **Step 4: Verify secrets and feature flags in production build**

With protected real public Supabase values and both phone flags false, run `npm run build:production`. Repeat with phone auth true and registration false, then both true. Search `dist/` and require no matches for AccessKey identifiers, secrets, service-role keys, database URLs, OTP values, or full test phone numbers.

Run:

```bash
rg -n "AliyunDysmsFullAccess|AliyunDypnsFullAccess|ACCESS_KEY|ACCESS_SECRET|service_role|postgresql://|13812345678" dist
```

Expected: no matches.

- [ ] **Step 5: Review the cumulative diff**

Run:

```bash
git diff --check
git status --short
git log --oneline --decorate -12
```

Confirm only planned files changed, no historical migration was edited, and `202608270008_phone_auth.sql` is the sole new schema migration.

- [ ] **Step 6: Commit documentation and final verification updates**

```bash
git add README.md docs/PROJECT_HANDOVER.md docs/supabase-setup.md
git commit -m "docs: add managed SMS authentication rollout"
```

- [ ] **Step 7: Prepare production dry-run handoff**

Do not modify production automatically. Provide the maintainer these commands after backup:

```bash
npx supabase migration list --db-url "$DATABASE_URL"
npx supabase db push --dry-run --db-url "$DATABASE_URL"
```

The maintainer must confirm the dry-run pending set and managed instance status before an explicitly approved production `db push`.
