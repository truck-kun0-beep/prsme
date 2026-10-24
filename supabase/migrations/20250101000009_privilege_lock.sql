-- =============================================================================
-- PRSME — Phase 6.1: the privilege outer lock, and a boolean that is boolean
-- =============================================================================
--
-- TWO REPAIRS, BOTH FOUND BY RUNNING THE MIGRATIONS AGAINST A REAL DATABASE
-- AND THEN EXERCISING THE RULES AS EACH ROLE.
--
-- Neither was visible to a static check. Both are the kind of thing that only
-- a live database can show.
--
-- 1. THE GRANT LEAK
--
--    Migration 0006 ends with narrow, deliberate grants:
--
--      grant select on public.media_items to anon, authenticated;
--      grant insert on public.media_items to authenticated;
--
--    and a comment explaining that no UPDATE or DELETE privilege is granted
--    for any client role, because "the privilege grant is the outer lock and
--    the policy is the inner one".
--
--    That comment was only half true. A `grant` statement ADDS a privilege. It
--    does not remove one that was already granted. On a real Supabase project
--    the `public` schema carries broad default privileges, so the tables were
--    created with ALL of: SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES
--    and TRIGGER for `anon` and `authenticated` — and migration 0006 added
--    narrower grants on top of those, without revoking the broad ones.
--
--    The consequence was measured, not assumed:
--
--      anon: truncate media_items   -> DENIED   (no TRUNCATE policy; RLS does
--                                                  not govern TRUNCATE at all,
--                                                  so the privilege decides)
--      anon: truncate media_reviews -> ALLOWED  <-- the whole review table
--                                                  emptied by an anonymous
--                                                  request
--      anon: delete from media_items -> ALLOWED  (RLS filtered every row, so
--                                                  zero rows were affected)
--
--    The TRUNCATE case is the serious one. Row Level Security does not apply
--    to TRUNCATE, so a client role holding the TRUNCATE privilege can empty a
--    table outright, with no policy to stop it.
--
--    THE FIX is to make the grants match what the schema actually needs:
--
--      media_items    SELECT for anon + authenticated, INSERT for authenticated
--      media_reviews  SELECT for anon + authenticated,
--                     INSERT/UPDATE/DELETE for authenticated
--
--    and to REVOKE everything else from the client roles, including TRUNCATE.
--
--    The application never writes to `media_items` except by INSERT, and never
--    updates or deletes a `media_reviews` row except its own (see
--    `lib/supabase/media.ts` and `lib/supabase/reviews.ts`), so nothing the
--    product does is affected by the revocation.
--
--    The trigger functions are revoked too. They are SECURITY DEFINER, and a
--    client role that can EXECUTE a SECURITY DEFINER function can call it
--    directly, with the definer's rights, to stamp a `published_at` or
--    `updated_at` on any row it likes. Revoking EXECUTE from the client roles
--    does NOT stop the triggers from firing: Postgres checks a trigger
--    function's EXECUTE privilege when the TRIGGER is created, not when it
--    fires. This was confirmed against the live database before relying on it.
--
-- 2. `can_read_review()` COULD RETURN NULL
--
--    The helper is declared `returns boolean`, and it is used as an RLS
--    policy qualifier:
--
--      using (can_read_review(user_id, status))
--
--    Its author branch was:
--
--      (select auth.uid()) = review_user_id
--
--    `auth.uid()` is NULL when there is no session — an anonymous visitor, or
--    any connection that has not set `request.jwt.claims`. The comparison
--    therefore evaluates to NULL, not FALSE, and the whole `or` expression
--    evaluates to NULL. A `returns boolean` function IS permitted to return
--    NULL, so the helper answered `null` where the contract says it answers
--    true or false.
--
--    RLS still behaved correctly — a policy qualifier must be TRUE for the
--    row to be visible, and NULL is not TRUE, so a visitor still could not
--    read a draft. But a helper advertised as returning a boolean was
--    answering "unknown" rather than "no", and any caller that compared the
--    result with `= false`, or surfaced it, would be misled. The live SQL
--    test suite caught exactly this: the assertion "a draft is not readable
--    by a stranger" failed, because the helper returned NULL rather than
--    false.
--
--    THE FIX is `coalesce(..., false)`, which makes the author branch a
--    definite FALSE when there is no session. The policy's behaviour is
--    unchanged; the helper's contract is now honest.
--
-- Apply with:  supabase db push        (CLI, linked project)
--           or: paste into the Supabase SQL editor
--
-- This migration is additive and safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The privilege outer lock
-- -----------------------------------------------------------------------------
--
-- Revoke the broad default privileges first, then re-grant exactly what the
-- application needs. The order matters: a revoke that came after the grant
-- would take the privilege away again.
--
-- The `public` role (Postgres's PUBLIC) is revoked from too, because a
-- privilege granted to PUBLIC is inherited by every role including the
-- client ones, and revoking it from `anon` and `authenticated` alone would
-- leave the privilege in place.
--

-- `media_items` — a shared, world-readable catalogue.
--
-- Anonymous visitors read it (the Discover shelf, the search results). Only
-- a signed-in account may contribute a record, because a record is created
-- as part of publishing a review.
revoke all on table public.media_items from public, anon, authenticated;
grant select on table public.media_items to anon, authenticated;
grant insert on table public.media_items to authenticated;

-- `media_reviews` — read by anyone, subject to the SELECT policy; written
-- only by the author, which the INSERT/UPDATE/DELETE policies enforce.
revoke all on table public.media_reviews from public, anon, authenticated;
grant select on table public.media_reviews to anon, authenticated;
grant insert, update, delete on table public.media_reviews to authenticated;

-- `profiles` — a public profile is world-readable; everything else is the
-- owner's. The SELECT policy decides, and the privileges decide what the
-- policy is even allowed to be asked.
revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to anon, authenticated;
grant insert, update, delete on table public.profiles to authenticated;

-- The aggregate view is world-readable, because it is `security_invoker`:
-- it aggregates exactly the rows the caller may already read, so granting
-- SELECT on it exposes nothing new. It is a VIEW, so it has no INSERT or
-- UPDATE to revoke.
revoke all on table public.media_review_stats from public, anon, authenticated;
grant select on table public.media_review_stats to anon, authenticated;

-- -----------------------------------------------------------------------------
-- The trigger functions
-- -----------------------------------------------------------------------------
--
-- These are SECURITY DEFINER. A client role that can EXECUTE one can call it
-- directly, bypassing the policies, and stamp a timestamp on any row.
--
-- Revoking EXECUTE does NOT stop the triggers from firing. Postgres checks a
-- trigger function's EXECUTE privilege when the TRIGGER is created; firing it
-- runs it with the table owner's rights regardless of who called the DML.
-- Confirmed against the live database before relying on it here.
-- -----------------------------------------------------------------------------
revoke all on function public.set_media_items_updated_at() from public, anon, authenticated;
revoke all on function public.set_media_reviews_updated_at() from public, anon, authenticated;
revoke all on function public.sync_media_reviews_published_at() from public, anon, authenticated;
revoke all on function public.set_profiles_updated_at() from public, anon, authenticated;

-- The backfill is an operator action. It is never callable from a browser.
revoke all on function public.backfill_profile_state_reviews() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. `can_read_review()` must answer true or false
-- -----------------------------------------------------------------------------
--
-- `auth.uid()` is NULL without a session, so the author branch compared NULL
-- with a uuid and produced NULL. `coalesce` turns that into a definite
-- FALSE, so the helper honours its `returns boolean` contract.
--
-- The policy's behaviour is unchanged: a NULL qualifier did not match a row
-- either, so a visitor still cannot read a draft. Only the helper's own
-- answer becomes unambiguous.
-- -----------------------------------------------------------------------------
create or replace function public.can_read_review(
  review_user_id uuid,
  review_status text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- The author always sees their own review, draft or published.
    --
    -- `coalesce` is load-bearing, not defensive noise. `auth.uid()` is NULL
    -- when there is no session — an anonymous visitor, or any caller that has
    -- not set `request.jwt.claims` — so the plain comparison
    -- `(select auth.uid()) = review_user_id` evaluates to NULL rather than
    -- FALSE. A `returns boolean` function is then allowed to return NULL,
    -- and NULL is NOT TRUE, so the branch produced NULL instead of a
    -- definite "no".
    --
    -- The visible symptom was a helper answering `null` where the caller
    -- expected `false`: the RLS policy still hid the row (NULL is not TRUE,
    -- so the policy did not match), but a helper advertised as returning a
    -- boolean was answering "unknown" instead of "no". Any caller that
    -- tested the result with `= false`, or that reported it, would be
    -- misled.
    coalesce((select auth.uid()) = review_user_id, false)
    or (
      review_status = 'published'
      and exists (
        select 1
        from public.profiles p
        where p.user_id = review_user_id
          and p.visibility = 'public'
      )
    );
$$;

-- The helper is still reachable by the client roles: it is the policy
-- qualifier, and Postgres evaluates a policy with the querying role's
-- rights, so EXECUTE must be held by the role doing the query.
grant execute on function public.can_read_review(uuid, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- The username-availability helper
-- -----------------------------------------------------------------------------
--
-- Kept reachable by both client roles — the onboarding form asks it — but
-- explicitly revoked from PUBLIC so the grant is deliberate rather than
-- inherited. It returns a bare boolean and never a row, so it discloses
-- nothing about who holds an account.
-- -----------------------------------------------------------------------------
revoke all on function public.is_username_taken(text) from public;
grant execute on function public.is_username_taken(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- The claim helpers
-- -----------------------------------------------------------------------------
--
-- `auth.uid()`, `auth.role()`, `auth.jwt()` and `auth.email()` read the
-- verified JWT claims. The policies call `auth.uid()`, so EXECUTE must be
-- held by the client roles. The grant is made explicit so it is a decision
-- on the record rather than a side effect of the extension's defaults.
-- -----------------------------------------------------------------------------
grant execute on function auth.uid() to anon, authenticated;
grant execute on function auth.role() to anon, authenticated;
grant execute on function auth.jwt() to anon, authenticated;
grant execute on function auth.email() to anon, authenticated;
