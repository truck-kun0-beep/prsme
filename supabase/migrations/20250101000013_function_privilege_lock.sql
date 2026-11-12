-- =============================================================================
-- PRSME — Phase 8.3: the FUNCTION privilege lock
-- =============================================================================
--
-- WHAT THIS IS
--
-- Migration 00012 revoked EXECUTE on the social helpers "from public", and
-- that was not enough. On a real Supabase project the `public` schema
-- carries DEFAULT PRIVILEGES that grant EXECUTE on every newly created
-- function to `anon` and `authenticated`. A `revoke ... from public` removes
-- the PUBLIC grant only; the explicit per-role grant that the default
-- privilege installed stays exactly where it is.
--
-- The live database was measured before this file was written. The ACL on
-- every social helper was the same:
--
--   {postgres=X, anon=X, authenticated=X, service_role=X}
--
-- So an ANONYMOUS visitor could call every one of them over PostgREST, with
-- the definer's rights, and read answers they were never meant to see. The
-- worst of them is `is_blocked_between(a, b)`: it takes two arbitrary account
-- ids and reports whether either has blocked the other, reading the block
-- table past the RLS policy that hides a block from the blocked account.
--
-- `user_blocks_cuts_follows` is a TRIGGER function that DELETES follow edges.
-- Migration 00012 revoked the other trigger functions and missed this one.
--
-- Migration 0009 already documented the shape of this bug for TABLES — "a
-- `grant` statement ADDS a privilege; it does not remove one that was
-- already granted" — and the same is true of a function's default
-- privilege. This file applies the lesson to functions.
--
-- THE FIX, IN THREE PARTS
--
--   1. The DEFAULT PRIVILEGES are corrected, so a function is no longer
--      callable by a client role unless a migration says so.
--   2. Every helper is revoked explicitly and then re-granted to exactly the
--      roles that need it.
--   3. The PUBLIC grant is revoked from the DATABASE-level default, because
--      that is the one that actually reaches a new function.
--
-- WHY PART 3 IS NOT OPTIONAL
--
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public` does NOT stop a new function
-- from being executable by PUBLIC.
--
-- Postgres's built-in default grants EXECUTE on a function to PUBLIC. A
-- schema-level default-privilege entry ADDS to that global default rather
-- than replacing it, and an entry can only name the grants it makes — so a
-- schema-level list that omits PUBLIC does not remove PUBLIC.
--
-- This was measured, not assumed. With the schema-level entry corrected to
-- `{postgres=X, service_role=X}`, a freshly created function still came out
-- as:
--
--   {=X/postgres, postgres=X/postgres, service_role=X/postgres}
--
-- — the `=X` is PUBLIC. The global default is the only thing that can take
-- it away, so the revoke has to be made there:
--
--   alter default privileges revoke execute on functions from public;
--
-- After that, the same freshly created function comes out as
-- `{postgres=X/postgres, service_role=X/postgres}`, and `anon` cannot execute
-- it.
--
-- WHICH ROLES NEED WHAT
--
--   anon          is_publicly_visible, profile_summary, is_username_taken,
--                 can_read_review
--
--                   - the anonymous profiles SELECT policy uses
--                     is_publicly_visible as its qualifier;
--                   - an unsigned-in visitor reads a profile's shell through
--                     profile_summary, and the onboarding form asks
--                     is_username_taken;
--                   - the anonymous media_reviews SELECT policy uses
--                     can_read_review.
--
--   authenticated can_comment_on, can_view_profile, is_follower,
--                 has_follow_state, is_blocked_between
--
--                   - each one is an RLS policy qualifier, and Postgres
--                     evaluates a policy with the QUERYING role's rights, so
--                     the role that runs the policy must be able to execute
--                     it.
--
--   no client role follow_status_for, user_blocks_cuts_follows
--
--                   - both are reached only from inside another SECURITY
--                     DEFINER function or from a trigger, and that call runs
--                     with the OWNER's rights. A client that could call them
--                     directly would step around the rules they enforce.
--
-- ONE LIMIT, STATED PLAINLY
--
-- The `public` schema also carries a default-privilege entry owned by
-- `supabase_admin`, and this role cannot change another role's default
-- privileges (`alter default privileges for role supabase_admin …` is
-- refused with "permission denied to change default privileges").
--
-- So a function created BY `supabase_admin` would still be executable by
-- `anon` by default. That does not affect this project: the migration chain
-- is applied by `postgres`, and part 2 below revokes EXECUTE from PUBLIC and
-- from `anon` on every function it creates, so a function cannot be left
-- open by omission either way.
--
-- Apply with:  supabase db push        (CLI, linked project)
--           or: paste into the Supabase SQL editor
--
-- This migration is additive and safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The default privileges
-- -----------------------------------------------------------------------------
--
-- A function is no longer callable by a client role unless a migration grants
-- it. The grants below are then decisions on the record, rather than a side
-- effect of the schema's defaults.
--
-- `service_role` keeps the default: it is a trusted server role that bypasses
-- RLS anyway, and the application uses it for setup and teardown.
--
-- The PUBLIC grant is revoked at the DATABASE level, because that is the
-- level that reaches a new function — see the header.
--
alter default privileges revoke execute on functions from public;

alter default privileges in schema public
  revoke execute on functions from anon;

alter default privileges in schema public
  revoke execute on functions from authenticated;

alter default privileges in schema public
  revoke execute on functions from public;

-- -----------------------------------------------------------------------------
-- 2. The helpers that need a SESSION
-- -----------------------------------------------------------------------------
--
-- These answer a question ABOUT THE CALLER — "are you a follower?", "may you
-- comment?" — so they are meaningless without one, and an anonymous caller
-- only ever gets a false answer to a question they should not be asking.
--
-- `is_blocked_between` is the sharpest of them: it takes two arbitrary
-- account ids, so an anonymous visitor could ask about any pair of accounts
-- in the system.
--
-- The revoke names `anon` explicitly. Revoking only from `public` would leave
-- the default privilege's own grant in place, which is the bug this file
-- exists to close.
--
revoke all on function public.can_comment_on(uuid) from public, anon;
revoke all on function public.can_view_profile(uuid) from public, anon;
revoke all on function public.is_follower(uuid) from public, anon;
revoke all on function public.has_follow_state(uuid) from public, anon;
revoke all on function public.is_blocked_between(uuid, uuid) from public, anon;

-- The policies that call them are `to authenticated`, so that role needs
-- EXECUTE. It is granted explicitly rather than inherited.
grant execute on function public.can_comment_on(uuid) to authenticated;
grant execute on function public.can_view_profile(uuid) to authenticated;
grant execute on function public.is_follower(uuid) to authenticated;
grant execute on function public.has_follow_state(uuid) to authenticated;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. The helpers that need NO session
-- -----------------------------------------------------------------------------
--
-- These answer a question ABOUT THE SUBJECT, and they are the ones an
-- anonymous visitor is allowed to ask — a public profile's shell, and whether
-- a username is taken.
--
-- The revoke names `public` alone here, because the anonymous role is
-- supposed to be able to execute them.
--
revoke all on function public.is_publicly_visible(uuid) from public;
revoke all on function public.profile_summary(uuid) from public;
revoke all on function public.is_username_taken(text) from public;
revoke all on function public.can_read_review(uuid, text) from public;

grant execute on function public.is_publicly_visible(uuid) to anon, authenticated;
grant execute on function public.profile_summary(uuid) to anon, authenticated;
grant execute on function public.is_username_taken(text) to anon, authenticated;
grant execute on function public.can_read_review(uuid, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. The helpers only a trigger or another definer function may reach
-- -----------------------------------------------------------------------------
--
-- `follow_status_for` is called by the follow guard triggers, and
-- `user_blocks_cuts_follows` IS a trigger. Neither is ever called by a client.
--
-- Revoking EXECUTE does NOT stop a trigger from firing: Postgres checks a
-- trigger function's EXECUTE privilege when the TRIGGER is created, and
-- firing it runs it with the table owner's rights regardless of who called
-- the DML. That behaviour was confirmed against a live database before it
-- was relied on here.
--
-- `user_blocks_cuts_follows` deletes follow edges. A client that could call
-- it directly could remove any relationship in the system, so it is revoked
-- from every client role.
--
revoke all on function public.follow_status_for(uuid) from public, anon, authenticated;
revoke all on function public.user_blocks_cuts_follows() from public, anon, authenticated;
