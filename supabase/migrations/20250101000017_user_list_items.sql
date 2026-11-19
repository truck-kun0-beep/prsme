-- =============================================================================
-- PRSME — Pre-Phase 11: My List
-- =============================================================================
--
-- WHAT THIS IS
--
-- A persistent, private, per-account queue of canonical media items — the
-- "things worth coming back to". One row per (account, media item) pair.
--
-- WHY A NEW TABLE AND NOT A COLUMN
--
-- A personal list is not profile customisation. It is per-account data with
-- its own lifecycle: it is written from many places (a Discover card, a
-- media page, a search result), it has to survive across devices, it has to
-- be private, and it needs to be queryable on its own ("my newest items",
-- "everything in my list that is a film").
--
-- The obvious alternative — a JSON array inside `profiles.profile_state` —
-- was rejected because:
--
--   1. `profile_state` is the *profile's public document*. A private list
--      inside it would be one field away from being published, and the
--      profile's RLS policy grants read access to followers.
--   2. Every read of the profile would drag the whole list along with it.
--   3. Writing one list item would rewrite the owner's entire customisation
--      document, which is the exact hazard the avatar work avoided.
--
-- WHY IT REFERENCES THE CANONICAL CATALOGUE
--
-- `media_id` references `public.media_items`, which already holds one row per
-- *work* — the shared catalogue. So:
--
--   - two accounts saving "Arrival" share ONE catalogue row and two list
--     rows, and the list page can show the real artwork and kind without a
--     second copy of the metadata;
--   - a review is NOT a list item. The list references the work, not the
--     review, so two reviews of the same film still produce ONE list entry.
--
-- THE CATEGORY IS DERIVED, NOT STORED
--
-- "To Watch" / "To Read" / "To Listen" are a function of the media item's
-- catalogue kind:
--
--   movie, tv          -> To Watch
--   book, manga        -> To Read
--   song, album        -> To Listen
--
-- The kind lives on `media_items` and is already constrained there. Storing a
-- second copy of it on the list row would be a denormalisation that could
-- disagree with the catalogue — so it is not stored. The mapping lives in
-- `lib/media/list.ts`, and the filter is applied in the query.
--
-- THE DUPLICATE RULE
--
-- UNIQUE (user_id, media_id). A double-submit, a double-click, and two tabs
-- open on the same media page all resolve to the same answer: the second
-- write hits the constraint instead of creating a second entry. The
-- application upserts on the same key, so "Add to List" is idempotent.
--
-- Apply with:  supabase db push        (CLI, linked project)
--           or: paste into the Supabase SQL editor
--
-- This migration is additive and safe to re-run.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- user_list_items
-- -----------------------------------------------------------------------------
create table if not exists public.user_list_items (
  id          uuid primary key default gen_random_uuid(),

  -- The account that owns this entry.
  --
  -- ON DELETE CASCADE: when the account goes, its list goes with it. A list
  -- with no owner is not a list — it is an orphan, and an orphan row that
  -- nobody can read is just clutter.
  user_id     uuid not null
                references auth.users (id) on delete cascade,

  -- The canonical catalogue record this entry points at.
  --
  -- ON DELETE CASCADE: if a catalogue row is removed, the list entries that
  -- pointed at it go too. An entry pointing at a work that no longer exists
  -- could not be rendered — there would be no title, no artwork, no kind to
  -- categorise it by.
  media_id    uuid not null
                references public.media_items (id) on delete cascade,

  -- When the owner added it.
  --
  -- This is the list's ordering key: "newest added first" is a plain
  -- descending sort on this column, with `id` as the tie-break so two items
  -- saved in the same millisecond still have a stable order.
  created_at  timestamptz not null default now(),

  -- THE duplicate rule.
  --
  -- One entry per (account, media item). This is what makes the save
  -- idempotent and what stops a list from filling with the same film twice.
  constraint user_list_items_unique_pair unique (user_id, media_id)
);

-- The owner's list, newest first. This is the index the /list page reads.
--
-- It is partial on nothing — every row belongs to exactly one owner — so it
-- is the whole table.
create index if not exists user_list_items_owner_created_idx
  on public.user_list_items (user_id, created_at desc, id desc);

-- A quick "how many items do I have" count.
create index if not exists user_list_items_owner_idx
  on public.user_list_items (user_id);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
--
-- THE RULE, STATED ONCE
--
--   A list entry is visible to the account that owns it, and to nobody else.
--   The owner may add their own entries and remove their own entries.
--   Nobody — including a moderator — may read another account's list.
--
-- WHY THE LIST IS PRIVATE BY DEFAULT
--
-- There is no sharing mechanism for a personal list in this phase, and the
-- brief asks for none. So there is exactly one reader of a list row: its
-- owner. A policy that admitted anybody else would need a rule for "who may
-- see this list" — and the honest answer is "nobody yet".
--
-- WHY `auth.uid()` AND NOT A COLUMN THE CALLER SENDS
--
-- `user_id` is a column, and a client can send any value it likes in an
-- INSERT body. The `with check` clause below compares the column against
-- `auth.uid()` — the verified session's subject — so a crafted request to
-- write an entry on somebody else's behalf is refused by the database. The
-- application derives `user_id` from the session too, but that is a
-- convenience; this is the guarantee.
--
-- The SELECT policy has no `moderator()` exception on purpose. The
-- moderation dashboard is for reports, restrictions, and an audit trail. A
-- personal list is not moderation material, and giving moderators a read
-- path into it would be a surveillance surface nobody asked for.
-- -----------------------------------------------------------------------------
alter table public.user_list_items enable row level security;

-- Read your own list.
drop policy if exists "accounts can read their own list" on public.user_list_items;
create policy "accounts can read their own list"
  on public.user_list_items
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Add to your own list.
--
-- `with check` is evaluated against the row that WOULD BE written, so this is
-- what stops a crafted insert from saving an item onto another account.
drop policy if exists "accounts can add to their own list" on public.user_list_items;
create policy "accounts can add to their own list"
  on public.user_list_items
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- Remove from your own list.
--
-- `using` is evaluated against the row that IS being deleted, so this can
-- only ever remove the caller's own entry.
drop policy if exists "accounts can remove from their own list" on public.user_list_items;
create policy "accounts can remove from their own list"
  on public.user_list_items
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- There is deliberately NO update policy. An entry's only mutable fields
-- would be `created_at` and `media_id`, and neither should ever change:
-- changing `media_id` would be "removing one thing and adding another" in
-- disguise, and changing `created_at` would rewrite the order the owner
-- built. A list entry is added or removed; it is not edited.

-- -----------------------------------------------------------------------------
-- The privilege lock
-- -----------------------------------------------------------------------------
--
-- The same shape as migrations 0009, 0013, 0015 and 0016: revoke first, then
-- grant exactly what the application needs, and nothing more.
--
-- `anon` gets nothing at all — an unauthenticated visitor has no list.
--
-- `authenticated` gets SELECT, INSERT and DELETE. No UPDATE, because no
-- update policy exists to make one safe.
-- -----------------------------------------------------------------------------
revoke all on table public.user_list_items from public, anon, authenticated;

grant select, insert, delete on table public.user_list_items to authenticated;
