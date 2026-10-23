-- =============================================================================
-- PRSME — Phase 6.1: canonical media catalogue
-- =============================================================================
--
-- One row per *work*, shared by every account. This is the table that makes
-- "two people reviewed Breaking Bad" mean one media page with two reviews,
-- rather than two near-identical shelves.
--
-- WHY A SHARED TABLE AT ALL
--
-- Before Phase 6, a selected catalogue item existed only as a fragment inside
-- one person's `profile_state` JSON: `provider`, `providerId`, `title`, a cover
-- URL. Two accounts who picked the same film each held their own copy, so
-- there was no shared identity to hang reviews off. Phase 6 introduces that
-- identity here.
--
-- IDENTITY RULE (the important one)
--
-- A work is identified by `(provider, provider_id)` — the pair a catalogue
-- provider itself uses. `provider_id` is the provider's own stable key: an
-- IMDb id, a MusicBrainz MBID, a MangaDex uuid, an iTunes track id.
--
-- We do NOT merge on title. "Arrival" the film and "Arrival" the book are
-- different works with different ids, and PRSME keeps them apart. A UNIQUE
-- constraint on `(provider, provider_id)` is therefore the entire identity
-- rule, and it does double duty as the concurrency guard the brief asks for:
-- when two accounts submit a review for the same item at the same moment,
-- exactly one INSERT into this table wins and the other is resolved by a
-- retry-read rather than by creating a duplicate.
--
-- CROSS-PROVIDER IDs
--
-- `external_ids` keeps whatever other identifiers the provider supplied (an
-- IMDb id behind a TVMaze record, a MusicBrainz release id behind an iTunes
-- one) so the information is not thrown away. We deliberately do NOT
-- auto-merge on it: a shared identifier is only as reliable as the provider
-- that reported it, and a wrong merge is far more damaging than two adjacent
-- rows. Records are merged by a deliberate, reviewable action instead.
--
-- ARTWORK
--
-- `artwork_url` is the provider's own externally-hosted image URL, and
-- `artwork_source` names whose artwork it is so the UI can attribute it.
-- Nothing here is a Supabase Storage path: posters, album covers, and book
-- covers are NOT copied into PRSME's bucket. The URL is validated against
-- the artwork allowlist in `lib/media/http.ts` before it is stored, so a
-- crafted cover URL cannot route a browser to an unexpected host.
--
-- Apply with:  supabase db push        (CLI, linked project)
--           or: paste into the Supabase SQL editor
--
-- This migration is additive and safe to re-run.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- media_items
-- -----------------------------------------------------------------------------
create table if not exists public.media_items (
  id          uuid primary key default gen_random_uuid(),

  -- ---------------------------------------------------------------------------
  -- Provider identity — THE identity of the record.
  --
  -- `provider` is the PRSME provider id (see `lib/media/types.ts`):
  -- cinemeta | tvmaze | tmdb | itunes | musicbrainz | mangadex | openlibrary |
  -- googlebooks
  --
  -- `provider_id` is that provider's own stable item id, stored verbatim
  -- (leading zeros and case are preserved) because it is an opaque key, not
  -- something we get to normalise.
  -- ---------------------------------------------------------------------------
  provider     text not null,
  provider_id  text not null,

  -- The catalogue kind. Mirrors `MediaKindId`. A song and an album are
  -- distinct kinds here even though the *profile* card collapses both to
  -- "music" — the catalogue needs the distinction to answer "albums" and
  -- "songs" separately.
  kind         text not null
                check (kind in ('movie', 'tv', 'song', 'album', 'manga', 'book')),

  title        text not null,
  -- Original-language / alternate title, when the provider supplied one.
  alternate_title text,

  -- Creator / artist / director / author, and the role that applies
  -- ("Director", "Artist", "Author"). Kept as two columns because the same
  -- field means different things per kind.
  creator      text,
  creator_role text,

  -- Release or publication year, when known.
  release_year integer,

  -- Externally hosted artwork. NEVER a Supabase Storage path and never a
  -- signed URL: signed URLs expire, and persisting one would break the
  -- artwork after its first expiry.
  artwork_url    text,
  -- Whose artwork it is ("Apple Music", "Wikimedia Commons", …) so the UI can
  -- attribute it honestly rather than implying PRSME owns it.
  artwork_source text,

  -- Canonical page on the provider ("View on TVMaze").
  external_url text,

  -- Short catalogue description. Never a review, never a score.
  description text,

  -- Free-form provider extras (runtime, episodes, ISBN, language, genres).
  -- Stored as JSONB so a new provider field does not need a migration.
  meta jsonb not null default '{}'::jsonb,

  -- Identifiers for OTHER providers, when the source record carried them.
  -- Kept for reference and for a deliberate, reviewable merge later — never
  -- used to merge rows automatically.
  external_ids jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- The identity constraint.
--
-- This is what makes the catalogue SHARED: one row per (provider, provider_id),
-- no matter how many accounts select it. It is also the concurrency guard —
-- two simultaneous inserts of the same item produce one row and one
-- unique_violation, rather than two near-identical works.
-- -----------------------------------------------------------------------------
create unique index if not exists media_items_provider_item_key
  on public.media_items (provider, provider_id);

-- Fast lookup by kind, for the Discover category filters.
create index if not exists media_items_kind_idx
  on public.media_items (kind);

-- Search support: title lookups are case-insensitive, so index the folded form.
create index if not exists media_items_title_lower_idx
  on public.media_items (lower(title));

-- Provider-specific lookups (e.g. "every TVMaze record").
create index if not exists media_items_provider_idx
  on public.media_items (provider);

-- -----------------------------------------------------------------------------
-- updated_at
--
-- A trigger rather than application code: an update that forgets to set the
-- column (a direct PostgREST PATCH, a future admin script) would otherwise
-- leave a stale timestamp.
-- -----------------------------------------------------------------------------
create or replace function public.set_media_items_updated_at()
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

drop trigger if exists media_items_set_updated_at on public.media_items;
create trigger media_items_set_updated_at
  before update on public.media_items
  for each row
  execute function public.set_media_items_updated_at();
