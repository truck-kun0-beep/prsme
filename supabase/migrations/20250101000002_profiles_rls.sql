-- =============================================================================
-- PRSME — Phase 5.2: Row Level Security on profiles
-- =============================================================================
--
-- The brief's requirement is that private-profile access be enforced at the
-- DATABASE and server boundaries, not hidden in the browser. This file is that
-- enforcement. Every read and write below is decided by the policies here;
-- application code is a convenience layer on top, never the actual gate.
--
-- The access model for this phase:
--
--   public profile  -> readable by anyone, including anonymous visitors
--   private profile -> readable ONLY by its owner
--
-- There is no followers tier yet because no follower feature exists; adding
-- one is a matter of extending the SELECT policy, not rewriting this file.
--
-- RLS is enabled, and `force row level security` is NOT used: the table owner
-- (the migration runner, the service role) legitimately bypasses RLS, and
-- forcing it would break the trigger function above.
-- =============================================================================

alter table public.profiles enable row level security;

-- -----------------------------------------------------------------------------
-- SELECT
-- -----------------------------------------------------------------------------
-- Two policies, OR'd. Supabase combines permissive policies with OR, so a row
-- is visible when EITHER matches.
--
--   1. a public profile is world-readable;
--   2. the owner reads their own profile regardless of visibility.
--
-- The consequence is the one the brief asks for: an anonymous visitor cannot
-- retrieve a private profile at all -- not its profile_state, not its
-- collections, reviews, custom links, or avatar_path. Those live in the row,
-- so a policy that hides the row hides everything in it. There is no second
-- table for a private profile's contents to leak through.
drop policy if exists "profiles are readable by owner" on public.profiles;
create policy "profiles are readable by owner"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "public profiles are readable by anyone" on public.profiles;
create policy "public profiles are readable by anyone"
  on public.profiles
  for select
  to anon, authenticated
  using (visibility = 'public');

-- -----------------------------------------------------------------------------
-- INSERT
-- -----------------------------------------------------------------------------
-- The owner may insert their own row -- and only their own.
--
-- `with check` is the load-bearing clause: it is evaluated against the row that
-- WOULD BE WRITTEN, so `user_id = auth.uid()` is what stops one account from
-- creating a profile owned by another. Without it, a crafted insert could
-- plant a row under someone else's id.
--
-- The `user_id = (select auth.uid())` form is the documented Supabase
-- performance idiom: wrapping `auth.uid()` in a scalar subquery lets Postgres
-- evaluate it once per statement instead of once per row.
drop policy if exists "owners can create their own profile" on public.profiles;
create policy "owners can create their own profile"
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- Note what is NOT here: no policy grants INSERT to `anon`. An unauthenticated
-- visitor cannot create a profile row at all.

-- -----------------------------------------------------------------------------
-- UPDATE
-- -----------------------------------------------------------------------------
-- `using`     -> which existing rows may be modified (owner only)
-- `with check`-> what the row must look like AFTER the update
--
-- The `with check` is not redundant with `using`. Without it, an owner could
-- update their own row and set `user_id` to a different account -- taking
-- their profile with them, or worse, orphaning it under someone else. This is
-- the exact clause that enforces "owners cannot change user_id to another
-- account".
drop policy if exists "owners can update their own profile" on public.profiles;
create policy "owners can update their own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- DELETE
-- -----------------------------------------------------------------------------
-- Not exposed as a product action in this phase, but the policy is written so
-- the table is not silently un-deletable. An owner removing their account
-- should not require a service-role key.
--
-- (Account deletion itself is a Supabase Dashboard action; this policy covers
-- the row so a future in-app delete is not blocked by RLS.)
drop policy if exists "owners can delete their own profile" on public.profiles;
create policy "owners can delete their own profile"
  on public.profiles
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- =============================================================================
-- Helper: is this username already taken?
-- =============================================================================
-- SECURITY DEFINER, so the existence check runs with the definer's rights and
-- can see rows the caller could not otherwise read (a private profile owned by
-- someone else).
--
-- It returns only a BOOLEAN. That is deliberate: an availability checker that
-- returned the profile row would leak a private profile's identity to anyone
-- probing for taken usernames. "Taken" is not the same as "here is who has it".
--
-- `stable` because it reads and never writes.
create or replace function public.is_username_taken(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where lower(username) = lower(candidate)
  );
$$;

revoke all on function public.is_username_taken(text) from public;
grant execute on function public.is_username_taken(text) to anon, authenticated;