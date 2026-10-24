-- =============================================================================
-- PRSME — Phase 6.1: the author relationship the review queries depend on
-- =============================================================================
--
-- WHAT THIS FIXES
--
-- `lib/supabase/reviews.ts` reads reviews with:
--
--   profiles!inner(username, profile_state),
--
-- That is PostgREST's EMBED syntax: it asks the REST layer to join the
-- review to its author's profile row in a single round trip. PostgREST can
-- only do that when it can see a FOREIGN KEY between the two tables.
--
-- There was no such key. `media_reviews.user_id` and `profiles.user_id` both
-- referenced `auth.users.id`, and a relationship through a shared parent is
-- not a relationship PostgREST can embed — it needs a direct key. So every
-- review query failed with:
--
--   Could not find a relationship between 'media_reviews' and 'profiles'
--   in the schema cache
--
-- which broke Discover Reviews, the media detail page, the review detail
-- page, and every review WRITE (the write path re-reads the row through the
-- same select clause). The static checks could not see this: the query is
-- valid PostgREST syntax, and the failure only appears against a database
-- where the key is missing.
--
-- THE FIX
--
-- A direct foreign key from `media_reviews.user_id` to `profiles.user_id`.
--
-- WHY IT IS SAFE
--
--   - `profiles.user_id` is UNIQUE (one profile per account), so this is a
--     one-to-one key. PostgREST will treat the embed as a to-one, which is
--     what the code expects.
--
--   - It does not change the meaning of any existing foreign key.
--     `media_reviews.user_id -> auth.users.id` stays, and so does
--     `profiles.user_id -> auth.users.id`. The new key is an ADDITIONAL
--     constraint, not a replacement.
--
--   - `ON DELETE CASCADE` matches the existing behaviour: deleting the
--     profile deletes the reviews that belonged to it, exactly as deleting
--     the account already did. The review cannot outlive its author.
--
--   - It adds a rule that was ALREADY true in practice: the application only
--     ever creates a review for an account that has a profile (the profile is
--     created during onboarding, and the review writer resolves the media
--     record from a signed-in owner). The constraint makes the database
--     enforce what the application already guaranteed.
--
--   - The privacy interlock is untouched. `can_read_review()` and the
--     SELECT policy still decide who may READ a review; this key only
--     describes how the review row relates to its author's profile row.
--
-- ORPHAN HANDLING
--
-- Adding the key fails if any existing review has no matching profile. The
-- DO block below reports that explicitly rather than silently deleting
-- somebody's work: a review whose author has no profile is data the
-- operator must decide about, not something to discard automatically.
--
-- Apply with:  supabase db push        (CLI, linked project)
--           or: paste into the Supabase SQL editor
-- =============================================================================

do $$
declare
  orphan_reviews integer;
begin
  -- Fail loudly, and say exactly how many rows are the problem, rather than
  -- raising an opaque constraint-violation error.
  select count(*) into orphan_reviews
  from public.media_reviews r
  left join public.profiles p on p.user_id = r.user_id
  where p.user_id is null;

  if orphan_reviews > 0 then
    raise exception
      'cannot add media_reviews -> profiles: % review(s) have no matching profile row. Resolve those rows first (give the author a profile, or delete the review).',
      orphan_reviews;
  end if;

  -- Add the key. `if not exists` because a re-run must be harmless.
  if not exists (
    select 1 from pg_constraint where conname = 'media_reviews_user_id_profiles_fkey'
  ) then
    alter table public.media_reviews
      add constraint media_reviews_user_id_profiles_fkey
      foreign key (user_id)
      references public.profiles (user_id)
      on delete cascade;

    comment on constraint media_reviews_user_id_profiles_fkey
      on public.media_reviews is
      'The author''s profile. Present so PostgREST can embed `profiles!inner(...)` '
      'in the review queries; it mirrors the `auth.users` key and cascades with it.';
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- The index behind the key
-- -----------------------------------------------------------------------------
--
-- A foreign key needs an index on the referencing column for the cascade
-- delete to be efficient, and for the join in the embed to be fast. The
-- existing `media_reviews_user_idx` already covers `(user_id)`, so no new
-- index is required.
-- -----------------------------------------------------------------------------
