-- =============================================================================
-- PRSME — Phase 5.1: profiles table
-- =============================================================================
--
-- One row per authenticated account. The product rule "one account owns
-- exactly one profile" is enforced HERE, not in application code: a unique
-- constraint on user_id is what makes a race between two simultaneous
-- onboarding requests resolve correctly. Application-level checks alone would
-- let both requests pass the "does this account have a profile yet?" test and
-- then both insert.
--
-- Apply with:  supabase db push        (CLI, linked project)
--           or: paste into the Supabase SQL editor
--
-- This migration is additive and safe to re-run.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key default gen_random_uuid(),

  -- THE ownership rule. `unique` is what enforces one-profile-per-account and
  -- also gives us the efficient reverse lookup "which profile does this user
  -- own?".
  user_id     uuid not null unique
                references auth.users (id) on delete cascade,

  -- Case-insensitive uniqueness.
  --
  -- A plain `unique (username)` is case-SENSITIVE in Postgres, which would
  -- happily store both `Mara` and `mara` -- two rows, two URLs, one apparent
  -- person. The unique index is therefore on `lower(username)`, so the
  -- constraint fires regardless of the casing a client sent. The column
  -- itself stays as supplied; the application lowercases before insert so the
  -- stored value is already canonical.
  username    text not null,

  -- Server-controlled. Kept OUT of profile_state (the JSONB blob) precisely so
  -- a client editing its own customization JSON cannot flip a private profile
  -- public or vice versa: this column is written only by an RLS-checked
  -- server path.
  visibility  text not null default 'private'
                check (visibility in ('public', 'private')),

  -- Phase 5.1 stores the Studio's customization as one versioned JSONB
  -- document. A schema version travels inside the document so a future change
  -- can migrate old rows instead of guessing at their shape.
  --
  -- NOTE ON SCOPE: reviews and ratings live inside this document rather than in
  -- their own tables. The audit found no pre-existing normalized database
  -- structure for them -- the whole application is local-storage only -- so
  -- there is nothing to preserve or duplicate. See README "Data model".
  profile_state jsonb not null default '{}'::jsonb,

  -- Path within the `avatars` bucket, never a public URL and never a signed
  -- URL. Signed URLs expire; persisting one would break the avatar after its
  -- first expiry and would leak a bearer-style credential into the profile
  -- row. See `lib/supabase/avatar.ts` for how this is resolved per request.
  avatar_path text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Username format, mirrored from lib/supabase/username.ts.
--
-- The database is the authority. The TypeScript validator exists so the
-- onboarding form can give an instant, friendly message; this constraint is
-- what actually guarantees no row can hold a username the router cannot
-- address.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_username_format'
  ) then
    alter table public.profiles
      add constraint profiles_username_format
      check (
        char_length(username) between 3 and 24
        and username ~ '^[a-z0-9_-]+$'
      );
  end if;
end
$$;

-- `noir` is reserved: it must keep serving the fictional demo with no database
-- configured. Enforced as a constraint, not just an application check, so a
-- direct REST call to PostgREST cannot bypass it either.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_username_reserved'
  ) then
    alter table public.profiles
      add constraint profiles_username_reserved
      check (
        username <> 'noir'
        and username not in (
          'studio', 'signin', 'sign-in', 'signup', 'sign-up',
          'forgot-password', 'reset-password', 'auth', 'account',
          'onboarding', 'create-profile', 'api', 'admin', 'settings',
          'discover', 'themes', 'taste', 'share', 'about', 'help',
          'support', 'privacy', 'terms', 'prsme'
        )
      );
  end if;
end
$$;

-- Case-insensitive uniqueness. `if not exists` because Postgres has no
-- `create unique index if not exists`; the DO block guards on index name.
create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));

-- Fast lookup by username for the public profile route.
create index if not exists profiles_username_idx
  on public.profiles (username);

-- Fast lookup of public profiles. Partial: the private-profile list is never
-- scanned, and the index stays small on a profile-heavy table.
create index if not exists profiles_public_idx
  on public.profiles (username)
  where visibility = 'public';

-- -----------------------------------------------------------------------------
-- updated_at
-- -----------------------------------------------------------------------------
-- A trigger rather than application code: an update that forgets to set the
-- column (a direct PostgREST PATCH, a future admin script) would otherwise
-- leave a stale timestamp.
create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_profiles_updated_at();