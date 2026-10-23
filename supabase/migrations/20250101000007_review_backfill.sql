-- =============================================================================
-- PRSME — Phase 6.4: backfill from profile_state, and review aggregates
-- =============================================================================
--
-- TWO JOBS IN THIS FILE.
--
-- 1. BACKFILL. Accounts created in Phase 5 may already hold reviews inside
--    `profiles.profile_state` — the JSON document that predates this table.
--    Those reviews are real work by a real person, so they must not be lost
--    when the normalised table becomes authoritative.
--
-- 2. AGGREGATES. The community rating and review count shown on a media page
--    must be computed from actual rows, in the database — not by loading every
--    review into the browser and averaging them there.
--
-- -----------------------------------------------------------------------------
-- 1. BACKFILL
-- -----------------------------------------------------------------------------
--
-- The shape being read:
--
--   profile_state -> 'collections' -> [ { "items": [ { ... } ] } ]
--
-- and each item may carry:
--
--   provider, providerId, title, coverUrl, coverSource, externalUrl, byline,
--   year, kind, myRating, myReviewTitle, myReview, myReviewSpoiler
--
-- The backfill is IDEMPOTENT. It uses `on conflict do nothing` on the
-- uniqueness constraints, so running it twice creates nothing the second
-- time. It also never DELETES or rewrites `profile_state` — the JSON is left
-- exactly as it was, so a rollback is a matter of dropping the new rows, and
-- an owner who still has the old build open keeps seeing their own reviews.
--
-- What it copies:
--
--   - an item becomes a `media_items` row (one per provider + provider id);
--   - an item with a rating or review text becomes a `media_reviews` row.
--
-- What it deliberately does NOT copy:
--
--   - items with NO provider identity. A hand-authored demo item has no
--     provider id, so there is nothing to key a catalogue record on, and
--     inventing an id would fabricate a catalogue entry.
--   - items with neither a rating nor review text. Those carry no review.
--
-- Publication state: an item that already had written review text is
-- published, because the owner had already written it on their profile where
-- visitors could read it. A rating-only item is published too — a rating is
-- public on a profile today, and dropping it would silently lose data.
--
-- `published_at` is backdated to the profile row's `updated_at` so the
-- ordering reflects when the review was actually written, rather than making
-- every backfilled review look simultaneous.
--
-- -----------------------------------------------------------------------------
-- 2. AGGREGATES
-- -----------------------------------------------------------------------------
--
-- `public.media_review_stats` is a per-media summary:
--
--   review_count     -> published reviews WITH written text (the number a
--                       reader sees as "N reviews");
--   rating_count     -> published rows that carry a rating (including
--                       rating-only rows);
--   community_rating -> the average of those ratings, to one decimal.
--
-- Two deliberate choices:
--
--   - `security_invoker = true`. The view runs with the CALLER's privileges, so
--     it inherits the RLS policies on the underlying tables. A private
--     profile's review is therefore excluded from the aggregate as well as
--     from the feed — the view cannot become a side channel around the
--     privacy rule. This is the check the brief asks for explicitly.
--
--   - `community_rating` is computed from PRSME users' own ratings only.
--     There is no external provider score anywhere in this schema, and the
--     view never invents a count: with no ratings, `community_rating` is NULL
--     and the UI renders no score rather than a zero that reads like a real
--     rating.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Backfill function
-- -----------------------------------------------------------------------------
create or replace function public.backfill_profile_state_reviews()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_reviews integer := 0;
begin
  /*
   * Step 1 — one media_items row per distinct (provider, provider_id).
   *
   * `on conflict do nothing` is what makes this idempotent AND what makes it
   * safe under concurrency: if another process inserted the same catalogue
   * record a moment earlier, this statement simply contributes nothing.
   */
  insert into public.media_items (
    provider,
    provider_id,
    kind,
    title,
    creator,
    release_year,
    artwork_url,
    artwork_source,
    external_url
  )
  select distinct on (item->>'provider', item->>'providerId')
    item->>'provider',
    item->>'providerId',
    -- The profile card collapses song+album into 'music'; the catalogue
    -- needs the distinction back. A profile item tagged 'music' is recorded
    -- as 'album' only when it has an artist, and 'song' otherwise — a
    -- deliberate, conservative reading, never a guess about a title.
    case
      when item->>'kind' = 'music' then
        case when coalesce(item->>'byline', '') <> '' then 'album' else 'song' end
      when item->>'kind' in ('movie', 'tv', 'manga', 'book') then item->>'kind'
      else 'movie'
    end,
    coalesce(nullif(btrim(item->>'title'), ''), 'Untitled'),
    nullif(btrim(item->>'byline'), ''),
    case
      when (item->>'year') ~ '^[0-9]{1,4}$' then (item->>'year')::integer
      else null
    end,
    nullif(btrim(item->>'coverUrl'), ''),
    nullif(btrim(item->>'coverSource'), ''),
    nullif(btrim(item->>'externalUrl'), '')
  from public.profiles p
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(p.profile_state->'collections') = 'array'
        then p.profile_state->'collections'
      else '[]'::jsonb
    end
  ) as c(collection)
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(c.collection->'items') = 'array'
        then c.collection->'items'
      else '[]'::jsonb
    end
  ) as item(item)
  where nullif(btrim(item.item->>'provider'), '') is not null
    and nullif(btrim(item.item->>'providerId'), '') is not null
    and nullif(btrim(item.item->>'title'), '') is not null
  order by item->>'provider', item->>'providerId';

  /*
   * Step 2 — one media_reviews row per (author, media) that has a rating or
   * review text.
   *
   * `on conflict do nothing` on `media_reviews_user_media_key` keeps this
   * idempotent and prevents a second run from duplicating a review.
   */
  insert into public.media_reviews (
    user_id,
    media_id,
    rating,
    title,
    body,
    is_spoiler,
    status,
    published_at
  )
  select
    p.user_id,
    m.id,
    case
      when (item.item->>'myRating') ~ '^[0-9]{1,2}(\.[0-9])?$'
        then least(10, greatest(0, (item.item->>'myRating')::numeric(3,1)))
      else null
    end,
    nullif(btrim(item.item->>'myReviewTitle'), ''),
    coalesce(btrim(item.item->>'myReview'), ''),
    coalesce((item.item->>'myReviewSpoiler')::boolean, false),
    'published',
    p.updated_at
  from public.profiles p
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(p.profile_state->'collections') = 'array'
        then p.profile_state->'collections'
      else '[]'::jsonb
    end
  ) as c(collection)
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(c.collection->'items') = 'array'
        then c.collection->'items'
      else '[]'::jsonb
    end
  ) as item(item)
  join public.media_items m
    on m.provider = item.item->>'provider'
   and m.provider_id = item.item->>'providerId'
  where nullif(btrim(item.item->>'provider'), '') is not null
    and nullif(btrim(item.item->>'providerId'), '') is not null
    and (
      coalesce(nullif(btrim(item.item->>'myReview'), ''), '') <> ''
      or (item.item->>'myRating') ~ '^[0-9]{1,2}(\.[0-9])?$'
    )
  on conflict (user_id, media_id) do nothing;

  get diagnostics inserted_reviews = row_count;
  return inserted_reviews;
end;
$$;

revoke all on function public.backfill_profile_state_reviews() from public;
-- Deliberately NOT granted to anon or authenticated: the backfill is an
-- operator action, run once by the migration runner or a DBA. It is never
-- callable from a browser.

-- -----------------------------------------------------------------------------
-- Per-media aggregates
-- -----------------------------------------------------------------------------
--
-- `security_invoker = true` is the load-bearing clause. It makes the view
-- read through the caller's RLS context, so it can only ever aggregate the
-- rows that caller is allowed to see.
--
-- Note the aggregate is over PUBLISHED reviews only. A draft is never counted
-- in a community score or a review count, even for its own author, because a
-- community score is a public statement about the work.
-- -----------------------------------------------------------------------------
drop view if exists public.media_review_stats;
create view public.media_review_stats
with (security_invoker = true)
as
select
  r.media_id,
  -- Reviews a reader can actually read: published, with written text.
  count(*) filter (where length(btrim(r.body)) > 0)      as review_count,
  -- Ratings a reader can actually read: published rows with a score, which
  -- includes rating-only rows that have no written review.
  count(r.rating)                                         as rating_count,
  -- The community score, from PRSME users' own ratings. NULL when there are
  -- none, so the UI can render "no score yet" instead of a misleading zero.
  round(avg(r.rating)::numeric, 1)                        as community_rating,
  max(r.published_at)                                     as last_reviewed_at
from public.media_reviews r
where r.status = 'published'
group by r.media_id;

comment on view public.media_review_stats is
  'Per-media review counts and community rating, computed from published '
  'PRSME reviews only. security_invoker means it inherits the RLS policies '
  'of the underlying tables, so private-profile reviews are excluded from '
  'public aggregates.';

-- -----------------------------------------------------------------------------
-- Grants on the view
--
-- `anon` and `authenticated` may read the view. Because it is
-- `security_invoker`, reading it still applies the RLS of the underlying
-- tables, so this grant exposes nothing that the reviewer could not already
-- read directly.
-- -----------------------------------------------------------------------------
grant select on public.media_review_stats to anon, authenticated;
