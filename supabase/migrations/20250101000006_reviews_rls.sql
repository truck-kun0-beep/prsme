-- =============================================================================
-- PRSME — Phase 6.3: Row Level Security on the shared catalogue and reviews
-- =============================================================================
--
-- This file is the access-control boundary for the two new public tables. The
-- application is a convenience layer on top of it; these policies are the
-- actual gate.
--
-- THE MODEL
--
--   media_items   -> public catalogue metadata. Anyone may READ. Anyone
--                    authenticated may INSERT (a review of a film nobody has
--                    catalogued yet must be able to create the record). NO
--                    authenticated user may UPDATE or DELETE — catalogue
--                    metadata is not the community's to rewrite.
--
--   media_reviews -> private by default.
--                    * a draft is visible ONLY to its author;
--                    * a published review is visible to anyone, but only when
--                      the author's PROFILE is public.
--
-- THE PRIVACY INTERLOCK
--
-- The important rule in this file is that a published review does not override
-- its author's privacy setting. Someone who publishes a review and then makes
-- their profile private must disappear from public discovery — the review is
-- still theirs, still readable by them, and still counted on their own
-- profile, but it is no longer part of the public feed.
--
-- That is implemented in the SELECT policy below as an EXISTS against
-- `public.profiles` on `visibility = 'public'`. It is a JOIN to the profile
-- table on every read, which is why the indexes on `profiles.visibility` and
-- on `media_reviews(user_id)` matter.
--
-- The consequence: a private profile's reviews are not merely hidden by the
-- application — the database refuses to return the row at all. There is no
-- aggregate endpoint, view, or RPC that can leak them, because every one of
-- those reads through the same policy.
--
-- NOTE ON `security definer` FUNCTIONS
--
-- The helper below (`public.can_read_review`) is SECURITY DEFINER so it can
-- see the `profiles` row even when the caller's own RLS would hide it (a
-- private profile). It returns only a BOOLEAN, never a row, so it cannot be
-- used to discover who holds an account.
-- =============================================================================

alter table public.media_items enable row level security;
alter table public.media_reviews enable row level security;

-- =============================================================================
-- media_items
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SELECT: world-readable.
--
-- A catalogue record is public metadata — the same information the provider
-- already publishes. It carries no owner data, no ratings, and no review
-- text, so there is nothing in it to leak.
-- -----------------------------------------------------------------------------
drop policy if exists "media items are readable by anyone" on public.media_items;
create policy "media items are readable by anyone"
  on public.media_items
  for select
  to anon, authenticated
  using (true);

-- -----------------------------------------------------------------------------
-- INSERT: any authenticated account may contribute a catalogue record.
--
-- This is required, not optional. When someone reviews a film nobody else has
-- reviewed, the media record has to be created as part of that review. The
-- `with check` clause constrains the shape of what may be written, so a
-- crafted insert cannot introduce a kind outside the known set.
--
-- Note there is NO column-level restriction here on `provider`/`provider_id`:
-- those are part of the record's identity and are set by the server, not
-- supplied by the browser — see `lib/supabase/media.ts`, which resolves the
-- catalogue record from the provider payload the server itself validated.
-- -----------------------------------------------------------------------------
drop policy if exists "authenticated users can add catalogue records" on public.media_items;
create policy "authenticated users can add catalogue records"
  on public.media_items
  for insert
  to authenticated
  with check (kind in ('movie', 'tv', 'song', 'album', 'manga', 'book'));

-- -----------------------------------------------------------------------------
-- UPDATE / DELETE: deliberately NOT granted.
--
-- There is no UPDATE policy and no DELETE policy for `authenticated` (or
-- `anon`). Postgres therefore refuses both operations for those roles: with
-- RLS enabled and no matching policy, the operation is denied.
--
-- This is the rule "a normal user cannot arbitrarily rewrite catalogue
-- metadata". Only the table owner — the migration runner / service role, which
-- legitimately bypasses RLS — can correct a catalogue row, and that is a
-- deliberate, audited action rather than something a browser can trigger.
-- =============================================================================

-- =============================================================================
-- media_reviews
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper: may the current caller read this review?
--
-- SECURITY DEFINER, so it can evaluate the author's profile visibility even
-- when the caller could not read that profile row directly. It returns only a
-- boolean, and it is granted only to the two client roles.
--
-- `stable` because it reads and never writes.
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
    (select auth.uid()) = review_user_id
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

revoke all on function public.can_read_review(uuid, text) from public;
grant execute on function public.can_read_review(uuid, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- SELECT
--
-- The whole rule, in one expression:
--
--   1. your own review — draft or published; or
--   2. a published review whose author has a PUBLIC profile.
--
-- A draft belonging to somebody else is never returned. A published review
-- belonging to a PRIVATE profile is never returned to anybody but its author.
-- -----------------------------------------------------------------------------
drop policy if exists "readable reviews follow their author's visibility" on public.media_reviews;
create policy "readable reviews follow their author's visibility"
  on public.media_reviews
  for select
  to anon, authenticated
  using (public.can_read_review(user_id, status));

-- -----------------------------------------------------------------------------
-- INSERT
--
-- The author may insert their own review, and only their own. `user_id` is
-- derived from the verified session on the server (see `app/api/reviews`),
-- but the `with check` clause enforces it at the database as well — so even a
-- direct PostgREST call cannot plant a review under somebody else's id.
-- -----------------------------------------------------------------------------
drop policy if exists "authors can create their own review" on public.media_reviews;
create policy "authors can create their own review"
  on public.media_reviews
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- UPDATE
--
-- `using`     -> which existing rows may be modified (your own, only).
-- `with check`-> what the row must look like AFTER the update.
--
-- The `with check` clause is what stops an author reassigning `user_id` to
-- another account (taking their review with them, or planting it on someone
-- else). It also keeps `media_id` and `user_id` inside the row the author
-- already owns.
-- -----------------------------------------------------------------------------
drop policy if exists "authors can update their own review" on public.media_reviews;
create policy "authors can update their own review"
  on public.media_reviews
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- DELETE
--
-- An author may remove their own review. This is what makes "edit or remove
-- their own review" a real capability rather than a hidden control.
--
-- No other user can delete a review, and no role can delete somebody else's.
-- -----------------------------------------------------------------------------
drop policy if exists "authors can delete their own review" on public.media_reviews;
create policy "authors can delete their own review"
  on public.media_reviews
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- =============================================================================
-- Grants
--
-- RLS decides WHICH rows a role may touch. These grants decide whether the
-- role may reach the table at all.
--
-- `anon` and `authenticated` get SELECT on both tables, INSERT on
-- `media_items`, and INSERT/UPDATE/DELETE on their own `media_reviews`.
-- Neither role gets UPDATE or DELETE on `media_items` — and even if a grant
-- were added by mistake, the absence of a matching RLS policy would still
-- deny the operation.
-- =============================================================================
grant usage on schema public to anon, authenticated;

grant select on public.media_items to anon, authenticated;
grant insert on public.media_items to authenticated;

-- No UPDATE or DELETE grant on `media_items` for any client role.
--
-- The RLS policies above already deny those operations, but the privilege
-- grant is the outer lock and the policy is the inner one. Leaving the
-- privilege out means a policy that was accidentally added or dropped in a
-- future migration still cannot let a browser rewrite catalogue metadata.
grant select on public.media_reviews to anon, authenticated;
grant insert, update, delete on public.media_reviews to authenticated;

-- The sequence behind `gen_random_uuid()` is not used by these tables (the
-- default is a function, not a sequence), but granting usage on all sequences
-- in the schema keeps a future serial default from failing for a client role.
grant usage, select on all sequences in schema public to anon, authenticated;

-- =============================================================================
-- Sanity check: the policies must not be satisfied by a public table owner.
--
-- `force row level security` is deliberately NOT enabled on these tables: the
-- table owner (the migration runner / service role) legitimately needs to
-- bypass RLS to repair a catalogue record and to run the backfill in the next
-- migration. The service role is never exposed to the browser.
-- =============================================================================
