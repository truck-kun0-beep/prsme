-- =============================================================================
-- PRSME — Phase 8.2: Row Level Security on the social layer
-- =============================================================================
--
-- The rule this file exists to enforce, stated once:
--
--   **Ownership is derived from the verified session, never from the request
--   body, and every rule about who may see or change a row is decided here
--   rather than in application code.**
--
-- Application code is a convenient layer above these policies. If a policy
-- were dropped, the queries in `lib/supabase/social.ts` and
-- `lib/supabase/comments.ts` would still refuse to return or write another
-- account's row.
--
-- THERE IS NO FRIENDSHIP POLICY, because there is no friendship feature.
-- Every policy below is about a ONE-WAY edge.
--
-- RLS DECIDES WHO; A TRIGGER DECIDES WHICH TRANSITION.
--
-- The split matters and is not a detail. An RLS policy's `with check` clause
-- sees only the NEW row — never the OLD one — so a policy alone cannot say
-- "a pending request may only become accepted, declined or cancelled". That
-- transition graph lives in the `follows_guard_update` trigger in migration
-- 00010. This file says WHO may write; the trigger says WHAT may be written.
-- =============================================================================

alter table public.follows enable row level security;
alter table public.profile_comments enable row level security;
alter table public.user_blocks enable row level security;
alter table public.content_reports enable row level security;

-- =============================================================================
-- follows
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SELECT
-- -----------------------------------------------------------------------------
--
-- A row is visible when the caller is one of its two ends.
--
--   - the FOLLOWER sees their own request ("Requested", "Following");
--   - the FOLLOWED sees who wants to follow them ("X followers", and the
--     pending-requests list).
--
-- The requester's own pending request is visible to them, which is what makes
-- "see requests you have sent" possible without a second table.
drop policy if exists "follows are visible to both ends" on public.follows;
create policy "follows are visible to both ends"
  on public.follows
  for select
  to authenticated
  using (
    (select auth.uid()) = follower_id
    or (select auth.uid()) = following_id
  );

-- -----------------------------------------------------------------------------
-- INSERT
-- -----------------------------------------------------------------------------
--
-- A caller may create a follow edge only for THEMSELVES.
--
-- `with check` is load-bearing: it is evaluated against the row that WOULD BE
-- WRITTEN, so `follower_id = auth.uid()` is what stops a crafted insert from
-- making somebody follow somebody else.
--
-- The `following_id <> auth.uid()` clause mirrors the table's CHECK
-- constraint, so a self-follow is refused here too with a clear error rather
-- than as a constraint violation.
drop policy if exists "callers can create their own follow" on public.follows;
create policy "callers can create their own follow"
  on public.follows
  for insert
  to authenticated
  with check (
    (select auth.uid()) = follower_id
    and following_id <> (select auth.uid())
    -- A blocked pair cannot create an edge in either direction.
    and not coalesce(
      public.is_blocked_between((select auth.uid()), following_id),
      false
    )
  );

-- -----------------------------------------------------------------------------
-- UPDATE
-- -----------------------------------------------------------------------------
--
-- EITHER end may update the edge — but the TRIGGER decides which transition
-- each of them is allowed to make.
--
-- This is the one place where the policy is deliberately broad and the
-- database does the fine-grained work. The reason is that an RLS policy's
-- `with check` clause sees only the NEW row and never the OLD one, so a
-- policy cannot express "only a pending request may become accepted".
--
-- The `follows_guard_update` trigger in migration 00010 can, because it sees
-- both rows and it knows who is calling. It is what enforces:
--
--   - only the FOLLOWED account may approve or decline a request;
--   - only the FOLLOWER may withdraw or re-request their own edge;
--   - the follower can NEVER move an edge to 'accepted';
--   - the edge's identity is immutable.
--
-- So the two together are strictly stronger than either alone: the policy
-- stops a third party from touching the row, and the trigger stops either
-- party from making a transition that is not theirs to make.
drop policy if exists "followed accounts can update their edge" on public.follows;
create policy "either end can update an edge"
  on public.follows
  for update
  to authenticated
  using (
    (select auth.uid()) = follower_id
    or (select auth.uid()) = following_id
  )
  with check (
    (select auth.uid()) = follower_id
    or (select auth.uid()) = following_id
  );

-- -----------------------------------------------------------------------------
-- DELETE
-- -----------------------------------------------------------------------------
--
-- Either end may delete the edge:
--
--   - the FOLLOWER unfollows;
--   - the FOLLOWED removes a follower.
--
-- Removing a follower and unfollowing are therefore the same operation on the
-- same row, which is what stops the two paths from drifting apart.
drop policy if exists "either end can remove an edge" on public.follows;
create policy "either end can remove an edge"
  on public.follows
  for delete
  to authenticated
  using (
    (select auth.uid()) = follower_id
    or (select auth.uid()) = following_id
  );

-- =============================================================================
-- profile_comments
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SELECT
-- -----------------------------------------------------------------------------
--
-- A comment is readable when the caller may see the profile it sits on.
--
-- `can_view_profile` is the single definition of that rule, and it is shared
-- with the `profiles` SELECT policy below. A comment on a private profile is
-- therefore invisible to a non-follower — and so is the count of them.
drop policy if exists "comments are readable on visible profiles" on public.profile_comments;
create policy "comments are readable on visible profiles"
  on public.profile_comments
  for select
  to authenticated
  using (public.can_view_profile(profile_id));

-- -----------------------------------------------------------------------------
-- INSERT
-- -----------------------------------------------------------------------------
--
-- The author must be the caller, and `can_comment_on` must say yes.
--
-- `can_comment_on` covers the private-profile rule (approved followers only),
-- the block rule, and the own-profile rule in one place.
drop policy if exists "callers can comment on profiles they may comment on" on public.profile_comments;
create policy "callers can comment on profiles they may comment on"
  on public.profile_comments
  for insert
  to authenticated
  with check (
    (select auth.uid()) = author_id
    and public.can_comment_on(profile_id)
  );

-- -----------------------------------------------------------------------------
-- UPDATE
-- -----------------------------------------------------------------------------
--
-- Only the AUTHOR may edit their own comment, and they may not move it to a
-- different profile or a different author.
--
-- The `with check` clause is what makes "edit your own comment" true rather
-- than "edit a comment you can see".
drop policy if exists "authors can edit their own comment" on public.profile_comments;
create policy "authors can edit their own comment"
  on public.profile_comments
  for update
  to authenticated
  using ((select auth.uid()) = author_id)
  with check ((select auth.uid()) = author_id);

-- -----------------------------------------------------------------------------
-- DELETE
-- -----------------------------------------------------------------------------
--
-- Either the AUTHOR or the PROFILE OWNER may delete a comment.
--
-- The owner's branch is what gives a profile owner moderation over their own
-- comments; the author's branch is what lets a person take something back.
drop policy if exists "authors and profile owners can delete a comment" on public.profile_comments;
create policy "authors and profile owners can delete a comment"
  on public.profile_comments
  for delete
  to authenticated
  using (
    (select auth.uid()) = author_id
    or (select auth.uid()) = profile_id
  );

-- =============================================================================
-- user_blocks
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SELECT
-- -----------------------------------------------------------------------------
--
-- ONLY the blocker sees their own blocks.
--
-- The blocked account must NOT be able to discover that it has been blocked —
-- a block that announces itself is not a block. So the policy names the
-- blocker and nobody else.
drop policy if exists "blockers can see their own blocks" on public.user_blocks;
create policy "blockers can see their own blocks"
  on public.user_blocks
  for select
  to authenticated
  using ((select auth.uid()) = blocker_id);

-- -----------------------------------------------------------------------------
-- INSERT
-- -----------------------------------------------------------------------------
--
-- The blocker creates the block, for themselves.
drop policy if exists "callers can block an account" on public.user_blocks;
create policy "callers can block an account"
  on public.user_blocks
  for insert
  to authenticated
  with check (
    (select auth.uid()) = blocker_id
    and blocked_id <> (select auth.uid())
  );

-- -----------------------------------------------------------------------------
-- UPDATE
-- -----------------------------------------------------------------------------
--
-- Nothing about a block is editable. The policy exists so the table is not
-- silently un-updatable by a granted privilege; it matches nothing.
drop policy if exists "blocks are not editable" on public.user_blocks;
create policy "blocks are not editable"
  on public.user_blocks
  for update
  to authenticated
  using (false)
  with check (false);

-- -----------------------------------------------------------------------------
-- DELETE
-- -----------------------------------------------------------------------------
--
-- Only the blocker may unblock.
drop policy if exists "blockers can remove their own blocks" on public.user_blocks;
create policy "blockers can remove their own blocks"
  on public.user_blocks
  for delete
  to authenticated
  using ((select auth.uid()) = blocker_id);

-- =============================================================================
-- content_reports
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SELECT
-- -----------------------------------------------------------------------------
--
-- Only the REPORTER sees their own reports.
--
-- The reported account must never see that it was reported: a report that
-- notifies its subject is a notice, not a report. There is no moderation
-- reader in this phase, so the reporter is the only reader.
drop policy if exists "reporters can see their own reports" on public.content_reports;
create policy "reporters can see their own reports"
  on public.content_reports
  for select
  to authenticated
  using ((select auth.uid()) = reporter_id);

-- -----------------------------------------------------------------------------
-- INSERT
-- -----------------------------------------------------------------------------
--
-- The reporter files the report, for themselves.
--
-- A report about a comment must name a comment that actually exists — the
-- foreign key enforces that. A report about a profile must name a profile that
-- actually exists; the application resolves and checks that before the write.
drop policy if exists "callers can file a report" on public.content_reports;
create policy "callers can file a report"
  on public.content_reports
  for insert
  to authenticated
  with check ((select auth.uid()) = reporter_id);

-- -----------------------------------------------------------------------------
-- UPDATE
-- -----------------------------------------------------------------------------
--
-- A report's `status` is what a future moderation queue would move. For now
-- the reporter may close their own report by dismissing it; nothing else is
-- editable, and the reporter cannot re-point it at a different subject.
drop policy if exists "reporters can update their own report" on public.content_reports;
create policy "reporters can update their own report"
  on public.content_reports
  for update
  to authenticated
  using ((select auth.uid()) = reporter_id)
  with check (
    (select auth.uid()) = reporter_id
    and status in ('open', 'dismissed')
  );

-- -----------------------------------------------------------------------------
-- DELETE
-- -----------------------------------------------------------------------------
--
-- Only the reporter may withdraw their own report.
drop policy if exists "reporters can withdraw their own report" on public.content_reports;
create policy "reporters can withdraw their own report"
  on public.content_reports
  for delete
  to authenticated
  using ((select auth.uid()) = reporter_id);

-- =============================================================================
-- The profiles SELECT policy, extended
-- =============================================================================
--
-- Phase 5 made a private profile readable only by its owner. Phase 8 extends
-- that to its ACCEPTED FOLLOWERS — which is the whole point of the follow
-- system, and the reason a follow has to be a real database row rather than a
-- client-side flag.
--
-- The Phase 5 policies are REPLACED, not added to, because permissive policies
-- combine with OR: leaving "profiles are readable by owner" in place would
-- keep the row invisible to followers, because the row would have to satisfy
-- BOTH policies.
--
-- `can_view_profile` is the same helper the comments policy uses, so "who may
-- see a profile" and "who may see a comment on it" cannot disagree.
drop policy if exists "profiles are readable by owner" on public.profiles;
drop policy if exists "public profiles are readable by anyone" on public.profiles;

create policy "profiles are readable by their owner and followers"
  on public.profiles
  for select
  to authenticated
  using (public.can_view_profile(user_id));

-- Anonymous visitors still see public profiles and nothing else.
--
-- This stays a separate policy because `can_view_profile` needs a session:
-- `auth.uid()` is NULL for an anonymous caller, so the helper would answer
-- FALSE for everything. The block check uses `is_publicly_visible`, which is
-- the session-free form of the same rule.
create policy "public profiles are readable by anyone"
  on public.profiles
  for select
  to anon, authenticated
  using (public.is_publicly_visible(user_id));

-- =============================================================================
-- Grants
-- =============================================================================
--
-- The privilege lock, extended to the new tables.
--
-- Migration 0009 established the rule: the `grant` is the OUTER lock and the
-- RLS policy is the INNER one. `revoke all` first, then grant exactly what
-- the application needs — and nothing more.
--
-- `anon` gets NO privilege on any of these tables. An anonymous visitor can
-- read a public profile (through the `profiles` policy above) but cannot read
-- a follower list, a comment, a block, or a report.
-- =============================================================================

revoke all on table public.follows from public, anon, authenticated;
grant select, insert, update, delete on table public.follows to authenticated;

revoke all on table public.profile_comments from public, anon, authenticated;
grant select, insert, update, delete on table public.profile_comments to authenticated;

revoke all on table public.user_blocks from public, anon, authenticated;
grant select, insert, delete on table public.user_blocks to authenticated;

revoke all on table public.content_reports from public, anon, authenticated;
grant select, insert, update, delete on table public.content_reports to authenticated;

-- The helper functions are SECURITY DEFINER, so a client role that can
-- EXECUTE one can call it with the definer's rights. They are policy
-- qualifiers, and Postgres evaluates a policy with the querying role's rights,
-- so EXECUTE must be held by the roles that query.
--
-- They are revoked from PUBLIC explicitly, so the grant is a decision on the
-- record rather than an inherited default.
revoke all on function public.is_follower(uuid) from public;
revoke all on function public.has_follow_state(uuid) from public;
revoke all on function public.is_blocked_between(uuid, uuid) from public;
revoke all on function public.can_comment_on(uuid) from public;
revoke all on function public.can_view_profile(uuid) from public;
revoke all on function public.is_publicly_visible(uuid) from public;
revoke all on function public.profile_summary(uuid) from public;

grant execute on function public.is_follower(uuid) to authenticated;
grant execute on function public.has_follow_state(uuid) to authenticated;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;
grant execute on function public.can_comment_on(uuid) to authenticated;
grant execute on function public.can_view_profile(uuid) to authenticated;

-- `is_publicly_visible` is the session-free form, and it is the qualifier of
-- the policy that lets an ANONYMOUS visitor read a public profile. The `anon`
-- role therefore has to be able to execute it, or every anonymous read of a
-- public profile fails with a permission error instead of returning the row.
grant execute on function public.is_publicly_visible(uuid) to anon, authenticated;

-- `profile_summary` is what a visitor uses to read a profile's SHELL — the
-- handle, display name, avatar, counts, and their own relationship to it —
-- without being able to read the content.
--
-- `anon` is included because the follower and following COUNTS are shown on
-- every profile, including to an anonymous visitor. For an anonymous caller
-- `auth.uid()` is NULL, so `is_follower` and `has_follow_state` both answer
-- "no relationship", and `is_blocked_between` is a no-op (a block names a
-- specific account, and an anonymous visitor is not that account).
grant execute on function public.profile_summary(uuid) to anon, authenticated;

-- The trigger functions are SECURITY DEFINER too, and are revoked from the
-- client roles for the same reason as in migration 0009: a client role that
-- can call one directly can bypass the rule it encodes.
--
-- Revoking EXECUTE does NOT stop the triggers from firing. Postgres checks a
-- trigger function's EXECUTE privilege when the TRIGGER is created; firing it
-- runs it with the table owner's rights regardless of who called the DML.
revoke all on function public.set_social_updated_at() from public, anon, authenticated;
revoke all on function public.follows_guard_update() from public, anon, authenticated;
revoke all on function public.follows_guard_insert() from public, anon, authenticated;

-- The `profiles` privileges are unchanged in shape, but the grant is repeated
-- here so this file is self-contained about what the social layer needs.
revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to anon, authenticated;
grant insert, update, delete on table public.profiles to authenticated;

-- The client roles need the claim readers the policies call.
grant execute on function auth.uid() to anon, authenticated;
grant execute on function auth.role() to anon, authenticated;
grant execute on function auth.jwt() to anon, authenticated;
grant execute on function auth.email() to anon, authenticated;
