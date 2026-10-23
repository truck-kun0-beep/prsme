-- =============================================================================
-- PRSME — Phase 5.3: avatar storage
-- =============================================================================
--
-- The bucket is PRIVATE. The brief is explicit that we must not put every
-- avatar in a publicly readable bucket, because profiles can be private and a
-- public bucket cannot express "visible only to the owner".
--
-- A private bucket means the object is unreachable without a policy grant or a
-- short-lived signed URL. `lib/supabase/avatar.ts` mints those server-side
-- AFTER checking that the requester may see the profile, so the storage policy
-- and the profile SELECT policy are enforced together rather than one
-- compensating for the other.
--
-- Only profile pictures live here. Media posters, music artwork, book covers,
-- manga covers and My Clicks images stay externally hosted -- PRSME stores a
-- reference URL for those, and deliberately does not proxy or mirror them.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,                 -- private: access is policy- or signed-URL-gated
  2097152,               -- 2 MB ceiling, enforced server-side by the bucket
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- Ownership path convention
-- -----------------------------------------------------------------------------
-- Every object lives at:  <auth.uid()>/<something>
--
-- The first path segment IS the owner id, which is what makes the policies
-- below a single expression rather than a join against `public.profiles`.
-- It also means an owner cannot overwrite another owner's avatar by guessing
-- a path: the folder they can write to is their own uid and nothing else.
-- -----------------------------------------------------------------------------

drop policy if exists "owners can upload their own avatar" on storage.objects;
create policy "owners can upload their own avatar"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "owners can replace their own avatar" on storage.objects;
create policy "owners can replace their own avatar"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "owners can delete their own avatar" on storage.objects;
create policy "owners can delete their own avatar"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- -----------------------------------------------------------------------------
-- Reading an avatar
-- -----------------------------------------------------------------------------
-- Deliberately NOT granted.
--
-- A `for select` policy on storage.objects would hand the bytes to any
-- authenticated user who could guess the path, which would defeat the private
-- bucket: the object is invisible in listings, but the bytes are still
-- retrievable by path. Avatars are therefore read exclusively through
-- server-issued signed URLs, minted by a route that has already checked that
-- the requester may view the owning profile.
--
-- For the owner's OWN avatar the same route is used, so there is exactly one
-- code path and one place where the access decision is made.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- Bucket size / type guards
-- -----------------------------------------------------------------------------
-- Belt-and-braces: the bucket's file_size_limit and allowed_mime_types above
-- are enforced by Storage, but a direct REST upload bypassing the app would
-- still rely on them. Nothing further is needed -- they are checked by the
-- storage API on every insert/update.
-- =============================================================================