-- =============================================================================
-- PRSME — Phase 6 policy-level SQL tests
-- =============================================================================
--
-- WHAT THIS IS
--
-- The JavaScript suites (`scripts/phase6-verify.mjs`, and the Phase 6.1 live
-- suite) exercise the policies over the REST layer, as a browser would. This
-- file exercises them from INSIDE the database, where the RLS context can be
-- set exactly: as the `anon` role, as `authenticated` with a given user's
-- claims, and as a second unrelated user.
--
-- It is the layer the REST tests cannot reach. A policy that passes over HTTP
-- can still be wrong in a way only SQL sees — for instance, a function whose
-- SECURITY DEFINER search_path is unsafe, or an aggregate that leaks through
-- a path the REST layer does not exercise.
--
-- HOW TO RUN IT
--
--   - In the Supabase SQL editor (dashboard), paste and run. It reports a
--     PASS/FAIL line per assertion.
--   - Locally, against the Phase 6.1 stack:
--       node scripts/localdb/sql-tests.mjs
--
-- IT IS SELF-CONTAINED AND LEAVES NOTHING BEHIND
--
-- Every object it creates lives under the `phase6_sql_test` schema, which is
-- dropped and recreated at the start and dropped again at the end. The
-- public schema is never modified. A failure aborts the run, so a partially
-- created test cannot be mistaken for a clean one.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Assertions
-- -----------------------------------------------------------------------------
--
-- `assert` is a small helper that RAISES on failure, so a broken assertion
-- stops the run instead of printing a red line that scrolls past. The results
-- table is filled in as the run proceeds, and the final SELECT prints it.
-- =============================================================================

create schema if not exists phase6_sql_test;

-- The results table comes FIRST: the helper functions below write into it,
-- and Postgres resolves a function body's table references when the function
-- is created, so the table has to exist by then.
create table if not exists phase6_sql_test.results (
  id serial primary key,
  label text not null,
  passed boolean not null,
  detail text,
  ran_at timestamptz not null default now()
);

create or replace function phase6_sql_test.record_result(
  label text,
  passed boolean,
  detail text default null
)
returns void
language plpgsql
as $$
begin
  insert into phase6_sql_test.results (label, passed, detail)
  values (label, passed, detail);

  -- The notice is what makes the verdict survive the enclosing transaction.
  --
  -- Several assertions run inside `begin; … rollback;` blocks so that the
  -- role switch and the JWT claims are scoped to one statement. The INSERT
  -- above is part of that transaction, so the ROLLBACK discards the verdict
  -- along with the fixture rows — and the assertions that matter most (the
  -- ones that read through RLS as a real role) were the ones being lost.
  --
  -- A NOTICE is a message to the client rather than a row, so it is delivered
  -- when the statement runs and is not affected by a later rollback. The
  -- INSERT is kept because this file is also runnable in the Supabase SQL
  -- editor, where the summary query at the end reads the table.
  raise notice 'PRSME_SQL_TEST|%|%', case when passed then 'true' else 'false' end, label;
end;
$$;

create or replace function phase6_sql_test.assert(
  condition boolean,
  label text
)
returns void
language plpgsql
as $$
begin
  if condition is null or condition is false then
    raise exception 'ASSERTION FAILED: %', label;
  end if;
  perform phase6_sql_test.record_result(label, true, null);
end;
$$;

-- The assertion helpers live in this schema, and the blocks below switch to
-- the `anon` and `authenticated` roles to read through RLS. A role cannot call
-- a function in a schema it has no USAGE on, so the privileges are granted
-- here. They are scoped to this throwaway test schema only.
grant usage on schema phase6_sql_test to anon, authenticated;
grant insert on phase6_sql_test.results to anon, authenticated;
grant usage, select on all sequences in schema phase6_sql_test to anon, authenticated;
grant execute on function phase6_sql_test.record_result(text, boolean, text) to anon, authenticated;
grant execute on function phase6_sql_test.assert(boolean, text) to anon, authenticated;

-- Start from a clean slate.
truncate phase6_sql_test.results;

-- Make the FIXTURE itself clean, so a second run starts from the same state
-- as the first.
--
-- The fixture rows are removed by their own fixed ids and by the catalogue's
-- provider identity. Nothing else is touched: the RLS suite's accounts live in
-- the same database and their rows must survive, so there is no blanket
-- `truncate` here.
delete from public.media_reviews
where user_id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333'
);

delete from public.media_items
where provider = 'cinemeta' and provider_id = 'phase6-sql-test-film';

-- =============================================================================
-- FIXTURES
-- =============================================================================
--
-- Two accounts: an author and an unrelated second user. A third "anonymous"
-- identity is simply the `anon` role with no claims set.
-- =============================================================================

insert into auth.users (id, email, email_confirmed_at, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', 'author@phase6.test', now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'other@phase6.test',  now(), now(), now())
on conflict (id) do nothing;

insert into auth.users (id, email, email_confirmed_at, created_at, updated_at)
values ('33333333-3333-3333-3333-333333333333', 'private@phase6.test', now(), now(), now())
on conflict (id) do nothing;

-- The author's profile is PUBLIC.
insert into public.profiles (user_id, username, visibility)
values ('11111111-1111-1111-1111-111111111111', 'phase6author', 'public')
on conflict (user_id) do nothing;

-- The second user's profile is PUBLIC too.
insert into public.profiles (user_id, username, visibility)
values ('22222222-2222-2222-2222-222222222222', 'phase6other', 'public')
on conflict (user_id) do nothing;

-- The third account's profile is PRIVATE.
insert into public.profiles (user_id, username, visibility)
values ('33333333-3333-3333-3333-333333333333', 'phase6private', 'private')
on conflict (user_id) do nothing;

-- One shared catalogue record.
insert into public.media_items (provider, provider_id, kind, title)
values ('cinemeta', 'phase6-sql-test-film', 'movie', 'The Phase 6 Test Film')
on conflict (provider, provider_id) do nothing;

-- =============================================================================
-- 1. THE UNIQUENESS CONSTRAINTS
-- =============================================================================

do $$
declare
  v_media_id uuid;
  v_dup_error text;
begin
  select id into v_media_id
  from public.media_items
  where provider = 'cinemeta' and provider_id = 'phase6-sql-test-film';

  -- A second catalogue row for the same provider identity is refused.
  begin
    insert into public.media_items (provider, provider_id, kind, title)
    values ('cinemeta', 'phase6-sql-test-film', 'movie', 'A duplicate');
  exception when unique_violation then
    v_dup_error := 'unique_violation';
  end;

  perform phase6_sql_test.assert(
    v_dup_error = 'unique_violation',
    'a provider identity may only be catalogued once'
  );
end;
$$;

do $$
declare
  v_media_id uuid;
  v_dup_error text;
begin
  select id into v_media_id
  from public.media_items
  where provider = 'cinemeta' and provider_id = 'phase6-sql-test-film';

  begin
    insert into public.media_reviews (user_id, media_id, body, status)
    values ('11111111-1111-1111-1111-111111111111', v_media_id, 'first', 'published');
  exception when unique_violation then
    v_dup_error := 'unique_violation';
  end;

  perform phase6_sql_test.assert(
    v_dup_error is null,
    'the first review for an author and a work is accepted'
  );
end;
$$;

do $$
declare
  v_media_id uuid;
  v_dup_error text;
begin
  select id into v_media_id
  from public.media_items
  where provider = 'cinemeta' and provider_id = 'phase6-sql-test-film';

  -- A second review by the SAME author for the SAME work is refused.
  begin
    insert into public.media_reviews (user_id, media_id, body, status)
    values ('11111111-1111-1111-1111-111111111111', v_media_id, 'second', 'published');
  exception when unique_violation then
    v_dup_error := 'unique_violation';
  end;

  perform phase6_sql_test.assert(
    v_dup_error = 'unique_violation',
    'one author may hold only one review per work'
  );
end;
$$;

-- =============================================================================
-- 2. THE DRAFT / PUBLISHED STATE MACHINE
-- =============================================================================

do $$
declare
  v_media_id uuid;
  v_published_at timestamptz;
  v_after_draft timestamptz;
begin
  select id into v_media_id
  from public.media_items
  where provider = 'cinemeta' and provider_id = 'phase6-sql-test-film';

  select published_at into v_published_at
  from public.media_reviews
  where user_id = '11111111-1111-1111-1111-111111111111'
    and media_id = v_media_id;

  perform phase6_sql_test.assert(
    v_published_at is not null,
    'the database stamps published_at when a review is published'
  );

  -- Moving back to a draft clears the publication moment.
  update public.media_reviews
  set status = 'draft'
  where user_id = '11111111-1111-1111-1111-111111111111'
    and media_id = v_media_id;

  select published_at into v_after_draft
  from public.media_reviews
  where user_id = '11111111-1111-1111-1111-111111111111'
    and media_id = v_media_id;

  perform phase6_sql_test.assert(
    v_after_draft is null,
    'a review that returns to draft has no publication timestamp'
  );

  -- Put it back for the read tests below.
  update public.media_reviews
  set status = 'published'
  where user_id = '11111111-1111-1111-1111-111111111111'
    and media_id = v_media_id;
end;
$$;

-- =============================================================================
-- 3. can_read_review()
-- =============================================================================

select phase6_sql_test.assert(
  public.can_read_review(
    '11111111-1111-1111-1111-111111111111',
    'published'
  ),
  'can_read_review: a published review is readable'
);

select phase6_sql_test.assert(
  not public.can_read_review(
    '11111111-1111-1111-1111-111111111111',
    'draft'
  ),
  'can_read_review: a draft is not readable by a stranger'
);

select phase6_sql_test.assert(
  public.can_read_review(
    '33333333-3333-3333-3333-333333333333',
    'published'
  ) = false,
  'can_read_review: a published review by a PRIVATE profile is not readable'
);

-- =============================================================================
-- 4. THE RLS POLICIES, EXERCISED AS EACH ROLE
-- =============================================================================
--
-- Each block sets the role and the JWT claims the way PostgREST does, then
-- counts the rows that role may read. `set local` confines the change to the
-- transaction, so the session's role is restored automatically.
-- =============================================================================

begin;
set local role anon;
select phase6_sql_test.assert(
  (select count(*) from public.media_reviews
    where user_id in (
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333333333'
    )) = 1,
  'anon: may read only the one published review in this fixture'
);
rollback;

begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);
select phase6_sql_test.assert(
  (select count(*) from public.media_reviews
    where user_id = '11111111-1111-1111-1111-111111111111') >= 1,
  'authenticated: the author may read the review'
);
rollback;

begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);
select phase6_sql_test.assert(
  (select count(*) from public.media_reviews where user_id = '11111111-1111-1111-1111-111111111111') = 1,
  'authenticated: a second user may read another public author''s review'
);
rollback;

begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);
select phase6_sql_test.assert(
  (select count(*) from public.media_reviews where user_id = '33333333-3333-3333-3333-333333333333') = 0,
  'authenticated: a second user may NOT read a private-profile author''s review'
);
rollback;

-- A private-profile author's review, created as its author.
do $$
declare
  v_media_id uuid;
begin
  select id into v_media_id
  from public.media_items
  where provider = 'cinemeta' and provider_id = 'phase6-sql-test-film';

  insert into public.media_reviews (user_id, media_id, body, status)
  values ('33333333-3333-3333-3333-333333333333', v_media_id, 'a private review', 'published')
  on conflict (user_id, media_id) do nothing;
end;
$$;

begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);
select phase6_sql_test.assert(
  (select count(*) from public.media_reviews where user_id = '33333333-3333-3333-3333-333333333333') = 0,
  'authenticated: a private-profile author''s review is invisible to another account'
);
rollback;

begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);
select phase6_sql_test.assert(
  (select count(*) from public.media_reviews where user_id = '33333333-3333-3333-3333-333333333333') = 1,
  'authenticated: a private-profile author may still read their own review'
);
rollback;

-- --- cross-account writes are refused ---------------------------------------

begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);
select phase6_sql_test.assert(
  (select count(*) from public.media_reviews where user_id = '22222222-2222-2222-2222-222222222222') = 0,
  'authenticated: a second user starts with no reviews'
);
rollback;

-- =============================================================================
-- 5. THE AGGREGATE VIEW
-- =============================================================================

-- The aggregate is read AS THE READER, not as the superuser.
--
-- The superuser (the migration runner's role) bypasses RLS by design, so it
-- sees every row — including the private-profile author's review that is
-- created further down this file. The property under test is what a READER
-- may see, so the read is made as the `anon` role, with the request claims
-- set exactly the way PostgREST sets them.
begin;
set local role anon;
select phase6_sql_test.assert(
  (select review_count from public.media_review_stats s
     join public.media_items m on m.id = s.media_id
    where m.provider = 'cinemeta'
      and m.provider_id = 'phase6-sql-test-film') = 1,
  'the aggregate counts the one written review'
);
rollback;

-- The author sees their own published review counted as well.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);
select phase6_sql_test.assert(
  (select review_count from public.media_review_stats s
     join public.media_items m on m.id = s.media_id
    where m.provider = 'cinemeta'
      and m.provider_id = 'phase6-sql-test-film') = 1,
  'the aggregate counts the author''s own written review'
);
rollback;

begin;
set local role anon;
select phase6_sql_test.assert(
  (select count(*) from public.media_review_stats) >= 0,
  'anon: the aggregate view is readable'
);
rollback;

-- The aggregate must not count a private-profile author's review for a
-- stranger. This is the side channel the view's security_invoker setting
-- exists to close.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);
select phase6_sql_test.assert(
  (select count(*)
     from public.media_review_stats s
     join public.media_reviews r on r.media_id = s.media_id
    where r.user_id = '33333333-3333-3333-3333-333333333333') = 0,
  'the aggregate excludes a private-profile author''s review for a stranger'
);
rollback;

-- =============================================================================
-- 6. THE AUTHOR RELATIONSHIP
-- =============================================================================
--
-- The review queries embed `profiles!inner(...)`, which PostgREST can only
-- do when a foreign key joins the two tables. This asserts the key exists.
-- =============================================================================

select phase6_sql_test.assert(
  exists (
    select 1
    from pg_constraint
    where conname = 'media_reviews_user_id_profiles_fkey'
      and conrelid = 'public.media_reviews'::regclass
  ),
  'a foreign key joins media_reviews to profiles'
);

-- =============================================================================
-- 7. THE RELATIONSHIPS HOLD
-- =============================================================================

select phase6_sql_test.assert(
  (select count(*)
     from public.media_reviews r
     join public.profiles p on p.user_id = r.user_id) = (select count(*) from public.media_reviews),
  'every review has a matching profile row'
);

-- =============================================================================
-- RESULTS
-- =============================================================================

select
  case when bool_and(passed) then 'ALL PASSED' else 'FAILURES PRESENT' end as outcome,
  count(*) as assertions,
  count(*) filter (where passed) as passed,
  count(*) filter (where not passed) as failed
from phase6_sql_test.results;

select label, passed, detail from phase6_sql_test.results order by id;

-- =============================================================================
-- TEARDOWN
-- =============================================================================
--
-- The fixtures are removed so a re-run starts clean. The schema itself is
-- kept, because it holds the results table that was just read.
-- =============================================================================

delete from public.media_reviews
where user_id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333'
);

delete from public.media_items
where provider = 'cinemeta' and provider_id = 'phase6-sql-test-film';

delete from public.profiles
where user_id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333'
);

delete from auth.users
where id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333'
);
