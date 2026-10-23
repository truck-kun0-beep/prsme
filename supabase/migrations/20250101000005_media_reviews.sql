-- =============================================================================
-- PRSME — Phase 6.2: normalized reviews and ratings
-- =============================================================================
--
-- Before this table, a review existed only as fields on a collection item
-- inside one person's `profile_state` JSON blob. That made a review
-- unqueryable, unshareable, and impossible to aggregate: there was no way to
-- ask "which reviews exist for this film?" without reading every profile.
--
-- This table is the authoritative home for a published review. The JSON blob
-- remains the home for *profile customisation* (theme, layout, collections,
-- links) — but a review that has been published to the database lives here.
--
-- ONE ROW PER PERSON PER MEDIA
--
-- `unique (user_id, media_id)` is the rule "a user has one current rating and
-- review record per media item". Editing an existing review UPDATES that row
-- rather than inserting a second one. This is a database guarantee, not an
-- application convention, so a double-submit cannot produce two reviews.
--
-- THE RATING SCALE
--
-- PRSME's scale is 0–10, and the constraint enforces it. The demo data carries
-- one decimal place (9.4), so `numeric(3,1)` allows that while still refusing
-- anything above 10.0 or below 0.0. A rating is optional — a person may write
-- a review without scoring it, and may score something without writing words.
--
-- RATING-ONLY vs. WRITTEN REVIEW
--
-- A row with an empty `body` is a rating-only record: it counts towards the
-- community average but must NOT appear as a written review in a feed. The
-- feed queries enforce that with `length(btrim(body)) > 0` rather than
-- trusting every caller to remember the distinction.
--
-- DRAFT vs. PUBLISHED
--
-- `status` is the explicit visibility rule. A draft is visible only to its
-- author. A published review is visible to the public *only when the author's
-- profile is public* — that is enforced by the SELECT policy in the next
-- migration, and it is deliberately not a property of this row alone.
--
-- Apply with:  supabase db push        (CLI, linked project)
--           or: paste into the Supabase SQL editor
--
-- This migration is additive and safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- media_reviews
-- -----------------------------------------------------------------------------
create table if not exists public.media_reviews (
  id          uuid primary key default gen_random_uuid(),

  -- The author. `on delete cascade` so deleting the Auth account removes the
  -- reviews with it — a review cannot outlive the person who wrote it.
  user_id     uuid not null
                references auth.users (id) on delete cascade,

  -- The canonical media record this review is about. `on delete cascade` so a
  -- catalogue record that is genuinely removed takes its reviews with it
  -- rather than leaving orphaned rows pointing at nothing.
  media_id    uuid not null
                references public.media_items (id) on delete cascade,

  -- ---------------------------------------------------------------------------
  -- The author's personal rating, on PRSME's own 0–10 scale.
  --
  -- This is NEVER an external provider's score. There is no IMDb rating, no
  -- audience average, and no viewer count anywhere in this schema — the
  -- community score shown on a media page is computed from these rows.
  --
  -- NULL means "not rated". A person may write a review without scoring it.
  -- ---------------------------------------------------------------------------
  rating      numeric(3,1)
                check (rating is null or (rating >= 0 and rating <= 10)),

  -- Optional headline. Optional body — a row may be rating-only.
  title       text,
  body        text not null default '',

  -- Whether the body contains spoilers. The reader collapses it until asked.
  is_spoiler  boolean not null default false,

  -- ---------------------------------------------------------------------------
  -- Publication state. The explicit visibility rule.
  --
  -- 'draft'     -> visible only to the author.
  -- 'published' -> visible to the public, subject to the author's profile
  --                visibility (enforced in RLS, not here).
  -- ---------------------------------------------------------------------------
  status      text not null default 'draft'
                check (status in ('draft', 'published')),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- When the review became public. NULL while it is a draft.
  --
  -- Kept separately from `updated_at` because "most recently published" and
  -- "most recently edited" are different orderings, and Discover Reviews
  -- ranks by the former.
  published_at timestamptz
);

-- -----------------------------------------------------------------------------
-- One current record per author per media item.
--
-- This is what makes "editing an existing review updates that record"
-- a database guarantee. The application issues an UPSERT on this constraint.
-- -----------------------------------------------------------------------------
create unique index if not exists media_reviews_user_media_key
  on public.media_reviews (user_id, media_id);

-- -----------------------------------------------------------------------------
-- Indexes for the query paths the app actually uses.
-- -----------------------------------------------------------------------------

-- The media detail page: "every published review for this media item".
create index if not exists media_reviews_media_idx
  on public.media_reviews (media_id);

-- Discover: "published reviews, newest first".
create index if not exists media_reviews_published_idx
  on public.media_reviews (published_at desc)
  where status = 'published';

-- Discover by category: the feed is filtered by the media item's kind, so the
-- hot path is "published reviews joined to a media item of this kind".
create index if not exists media_reviews_media_status_idx
  on public.media_reviews (media_id, status);

-- A user's own review list (the owner-facing dashboard and the profile's
-- review section).
create index if not exists media_reviews_user_idx
  on public.media_reviews (user_id);

-- "Most reviewed" ranking: counting published reviews per media item.
create index if not exists media_reviews_status_media_idx
  on public.media_reviews (status, media_id);

-- -----------------------------------------------------------------------------
-- updated_at
-- -----------------------------------------------------------------------------
create or replace function public.set_media_reviews_updated_at()
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

drop trigger if exists media_reviews_set_updated_at on public.media_reviews;
create trigger media_reviews_set_updated_at
  before update on public.media_reviews
  for each row
  execute function public.set_media_reviews_updated_at();

-- -----------------------------------------------------------------------------
-- published_at is maintained by the database, not by the client.
--
-- A client cannot set `published_at` to a fabricated date, and cannot leave a
-- published review with a NULL publication timestamp (which would make
-- "recently published" ordering arbitrary). The trigger keeps the column in
-- step with `status`:
--
--   - moving to 'published' stamps published_at if it is not already set;
--   - moving back to 'draft' clears it, because an unpublished review has no
--     publication moment.
--
-- The trigger is BEFORE UPDATE OR INSERT, so the value is correct even for a
-- row inserted directly through PostgREST.
-- -----------------------------------------------------------------------------
create or replace function public.sync_media_reviews_published_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'published' then
    if new.published_at is null then
      new.published_at := now();
    end if;
  else
    new.published_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists media_reviews_sync_published_at on public.media_reviews;
create trigger media_reviews_sync_published_at
  before insert or update of status, published_at on public.media_reviews
  for each row
  execute function public.sync_media_reviews_published_at();
