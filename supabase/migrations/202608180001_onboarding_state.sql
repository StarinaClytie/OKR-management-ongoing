-- Application-owned onboarding state (Phase 1.6 follow-up).
--
-- `auth.users.email_confirmed_at` is NOT a valid "onboarding complete" signal:
-- Supabase confirms the email the moment the invite link is clicked, before the
-- invitee has finished account setup (choosing a password). A confirmed email
-- therefore does not prove the user has completed onboarding, so we track
-- onboarding explicitly on the profile.
--
-- Backfill rule for pre-existing users: a user is operational (setup finished)
-- iff they have actually set a real password. An invited user who merely clicked
-- the invite link has `auth.users.encrypted_password = ''`; only a completed
-- `auth.updateUser({ password })` replaces it with a bcrypt hash. Basing the
-- backfill on a non-empty password therefore promotes genuine operational
-- accounts while never promoting a confirmed-but-incomplete account (whose email
-- may already be confirmed). It deliberately does NOT backfill every
-- `email_confirmed_at`-set user.

alter table public.profiles
  add column onboarding_completed boolean not null default false;

update public.profiles p
set onboarding_completed = true
where exists (
  select 1
  from auth.users u
  where u.id = p.id
    and coalesce(u.encrypted_password, '') <> ''
);

-- Mark the *caller's own* onboarding complete. Security-definer so it can write
-- the profile regardless of normal RLS write paths; scoped strictly to
-- `auth.uid()` (no parameters) so the browser can never complete another user's
-- onboarding. Idempotent: a completed profile is simply set to true again.
create or replace function public.complete_onboarding()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set onboarding_completed = true
  where id = auth.uid();
end;
$$;

revoke all on function public.complete_onboarding() from public, anon;
grant execute on function public.complete_onboarding() to authenticated;
