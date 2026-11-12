-- =============================================================================
-- PRSME — Phase 8 policy-level SQL tests
-- =============================================================================
--
-- WHAT THIS IS
--
-- The JavaScript suites exercise the policies over the REST layer, as a
-- browser would. This file exercises them from INSIDE the database, where the
-- RLS context can be set exactly: as the `anon` role, as `authenticated` with
-- a given user's claims, and as a second unrelated user.
--
-- It is the layer the REST tests cannot reach. The follow state machine, the
-- block predicate, and the private-profile access rule all live in triggers
-- and SECURITY DEFINER functions, and those are only observable from SQL.
--
-- HOW TO RUN IT
--
--   - In the Supabase SQL editor (dashboard), paste and run. It reports a
--     PASS/FAIL line per assertion.
--   - Locally, against the Phase 6.1 stack:
--       node scripts/localdb/sql-tests.mjs
--   - Against the REMOTE project:
--       node scripts/phase8-remote-sql-tests.mjs
--
-- IT IS SELF-CONTAINED AND LEAVES NOTHING BEHIND
--
-- Every object it creates lives under the `phase8_sql_test` schema, which is
-- dropped and recreated at the start and dropped again at the end. The
-- public schema is never modified — the fixture rows it writes are removed by
-- their own fixed ids before it starts and again at the end.
--
-- THERE IS NO FRIENDSHIP SYSTEM, AND THIS FILE PROVES IT
--
-- Section 12 asserts that no `friendships` table, no `friend_requests`
-- table, and no friend-specific column exist. The model is one-way, and the
-- test suite says so out loud.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Assertions
-- -----------------------------------------------------------------------------
--
-- `assert` is a small helper that RAISES on failure, so a broken assertion
-- stops the run instead of printing a red line that scrolls past. The results
-- table is filled in as the run proceeds, and the final SELECT prints it.
-- -----------------------------------------------------------------------------

create schema if not exists phase8_sql_test;

-- The results table comes FIRST: the helper functions below write into it,
-- and Postgres resolves a function body's table references when the function
-- is created, so the table has to exist by then.
create table if not exists phase8_sql_test.results (
  id serial primary key,
  label text not null,
  passed boolean not null,
  detail text,
  ran_at timestamptz not null default now()
);

create or replace function phase8_sql_test.record_result(
  label text,
  passed boolean,
  detail text default null
)
returns void
language plpgsql
as $$
begin
  insert into phase8_sql_test.results (label, passed, detail)
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

create or replace function phase8_sql_test.assert(
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
  perform phase8_sql_test.record_result(label, true, null);
end;
$$;

-- The assertion helpers live in this schema, and the blocks below switch to
-- the `anon` and `authenticated` roles to read through RLS. A role cannot call
-- a function in a schema it has no USAGE on, so the privileges are granted
-- here. They are scoped to this throwaway test schema only.
grant usage on schema phase8_sql_test to anon, authenticated;
grant insert on phase8_sql_test.results to anon, authenticated;
grant usage, select on all sequences in schema phase8_sql_test to anon, authenticated;
grant execute on function phase8_sql_test.record_result(text, boolean, text) to anon, authenticated;
grant execute on function phase8_sql_test.assert(boolean, text) to anon, authenticated;

-- Start from a clean slate.
truncate phase8_sql_test.results;

-- =============================================================================
-- FIXTURES
-- =============================================================================
--
-- FOUR accounts, so the tests can distinguish the four relationships that
-- matter:
--
--   alice  the owner of a PUBLIC profile
--   bob    the owner of a PRIVATE profile
--   carol  a third party, unrelated to alice and bob
--   dave   an account used only for the "no session" cases
--
-- The ids are fixed so a second run starts from the same state as the first.
-- =============================================================================

insert into auth.users (id, email, email_confirmed_at, created_at, updated_at)
values
  ('a1111111-1111-1111-1111-111111111111', 'alice@phase8.test',   now(), now(), now()),
  ('b2222222-2222-2222-2222-222222222222', 'bob@phase8.test',     now(), now(), now()),
  ('c3333333-3333-3333-3333-333333333333', 'carol@phase8.test',   now(), now(), now()),
  ('d4444444-4444-4444-4444-444444444444', 'dave@phase8.test',    now(), now(), now())
on conflict (id) do nothing;

-- Alice is PUBLIC.
insert into public.profiles (user_id, username, visibility, profile_state)
values (
  'a1111111-1111-1111-1111-111111111111',
  'phase8alice',
  'public',
  '{"version":1,"displayName":"Alice"}'::jsonb
)
on conflict (user_id) do nothing;

-- Bob is PRIVATE.
insert into public.profiles (user_id, username, visibility, profile_state)
values (
  'b2222222-2222-2222-2222-222222222222',
  'phase8bob',
  'private',
  '{"version":1,"displayName":"Bob"}'::jsonb
)
on conflict (user_id) do nothing;

-- Carol is PUBLIC.
insert into public.profiles (user_id, username, visibility, profile_state)
values (
  'c3333333-3333-3333-3333-333333333333',
  'phase8carol',
  'public',
  '{"version":1,"displayName":"Carol"}'::jsonb
)
on conflict (user_id) do nothing;

-- Make sure the fixture starts with no edges, comments, blocks or reports.
delete from public.content_reports
where reporter_id in (
  'a1111111-1111-1111-1111-111111111111',
  'b2222222-2222-2222-2222-222222222222',
  'c3333333-3333-3333-3333-333333333333',
  'd4444444-4444-4444-4444-444444444444'
);

delete from public.profile_comments
where author_id in (
  'a1111111-1111-1111-1111-111111111111',
  'b2222222-2222-2222-2222-222222222222',
  'c3333333-3333-3333-3333-333333333333',
  'd4444444-4444-4444-4444-444444444444'
);

delete from public.user_blocks
where blocker_id in (
  'a1111111-1111-1111-1111-111111111111',
  'b2222222-2222-2222-2222-222222222222',
  'c3333333-3333-3333-3333-333333333333',
  'd4444444-4444-4444-4444-444444444444'
);

delete from public.follows
where follower_id in (
  'a1111111-1111-1111-1111-111111111111',
  'b2222222-2222-2222-2222-222222222222',
  'c3333333-3333-3333-3333-333333333333',
  'd4444444-4444-4444-4444-444444444444'
);

-- =============================================================================
-- 1. THE SCHEMA EXISTS, AND THERE IS NO FRIENDSHIP SYSTEM
-- =============================================================================

select phase8_sql_test.assert(
  to_regclass('public.follows') is not null,
  'schema: the follows table exists'
);

select phase8_sql_test.assert(
  to_regclass('public.profile_comments') is not null,
  'schema: the profile_comments table exists'
);

select phase8_sql_test.assert(
  to_regclass('public.user_blocks') is not null,
  'schema: the user_blocks table exists'
);

select phase8_sql_test.assert(
  to_regclass('public.content_reports') is not null,
  'schema: the content_reports table exists'
);

-- The friendship system that must NOT exist.
select phase8_sql_test.assert(
  to_regclass('public.friendships') is null
  and to_regclass('public.friend_requests') is null
  and to_regclass('public.friend_list') is null,
  'schema: there is no friendships table and no friend_requests table'
);

-- No column anywhere in the public schema may mention a friend.
select phase8_sql_test.assert(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and column_name like '%friend%'
  ),
  'schema: no public column is named after a friend'
);

-- RLS is enabled on every new table.
select phase8_sql_test.assert(
  (select relrowsecurity from pg_class where oid = 'public.follows'::regclass)
    and (select relrowsecurity from pg_class where oid = 'public.profile_comments'::regclass)
    and (select relrowsecurity from pg_class where oid = 'public.user_blocks'::regclass)
    and (select relrowsecurity from pg_class where oid = 'public.content_reports'::regclass),
  'schema: RLS is enabled on every social table'
);

-- =============================================================================
-- 2. THE CONSTRAINTS
-- =============================================================================

-- The unique pair. This is what makes a double-submit and a concurrent
-- request resolve to ONE row.
select phase8_sql_test.assert(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.follows'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) like '%follower_id%'
      and pg_get_constraintdef(oid) like '%following_id%'
  ),
  'constraints: follows is unique on (follower_id, following_id)'
);

-- No self-follow.
select phase8_sql_test.assert(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.follows'::regclass
      and pg_get_constraintdef(oid) like '%follower_id <> following_id%'
  ),
  'constraints: follows refuses a self-follow'
);

-- The status is a closed set.
select phase8_sql_test.assert(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.follows'::regclass
      and pg_get_constraintdef(oid) like '%pending%'
      and pg_get_constraintdef(oid) like '%accepted%'
      and pg_get_constraintdef(oid) like '%declined%'
      and pg_get_constraintdef(oid) like '%cancelled%'
  ),
  'constraints: the follow status is a closed set of four values'
);

-- A comment is 1 to 1000 characters.
select phase8_sql_test.assert(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profile_comments'::regclass
      and pg_get_constraintdef(oid) like '%char_length(btrim(body))%'
      and pg_get_constraintdef(oid) like '%1000%'
  ),
  'constraints: a comment body is bounded to 1000 characters'
);

-- =============================================================================
-- 3. THE PRIVILEGE LOCK
-- =============================================================================
--
-- The grant is the OUTER lock and the RLS policy is the INNER one. `anon`
-- must hold NO privilege at all on the social tables: an anonymous visitor
-- can read a public profile, but not a follower list, a comment, a block, or
-- a report.
-- =============================================================================

select phase8_sql_test.assert(
  not exists (
    select 1
    from information_schema.role_table_grants
    where grantee = 'anon'
      and table_schema = 'public'
      and table_name in ('follows', 'profile_comments', 'user_blocks', 'content_reports')
  ),
  'privileges: anon holds NO privilege on any social table'
);

select phase8_sql_test.assert(
  exists (
    select 1
    from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'public'
      and table_name = 'follows'
      and privilege_type = 'SELECT'
  ),
  'privileges: authenticated can SELECT follows'
);

-- `anon` must not be able to TRUNCATE a social table. Row Level Security
-- does not govern TRUNCATE at all, so the privilege decides — and a granted
-- TRUNCATE would empty the table outright.
select phase8_sql_test.assert(
  not exists (
    select 1
    from information_schema.role_table_grants
    where grantee in ('anon', 'authenticated')
      and table_schema = 'public'
      and table_name in ('follows', 'profile_comments', 'user_blocks', 'content_reports')
      and privilege_type = 'TRUNCATE'
  ),
  'privileges: neither client role can TRUNCATE a social table'
);

-- THE FUNCTION PRIVILEGE LOCK.
--
-- The same leak applies to FUNCTIONS, and it is the one that a table-shaped
-- check cannot see. The `public` schema carries default privileges that grant
-- EXECUTE on every newly created function to `anon` and `authenticated`, so
-- `revoke ... from public` is not enough: it removes the PUBLIC grant and
-- leaves the default privilege's own per-role grant in place.
--
-- The consequence is that an anonymous visitor can call the SECURITY DEFINER
-- helpers directly, with the definer's rights. `is_blocked_between` is the
-- sharpest example: it takes two arbitrary account ids and reports whether
-- either has blocked the other, reading the block table past the policy that
-- hides a block from the blocked account.
--
-- `has_function_privilege` is the authority here, not the grants catalogue:
-- it answers what the role can ACTUALLY do, including anything it inherits
-- through PUBLIC.
--
select phase8_sql_test.assert(
  not has_function_privilege(
    'anon',
    'public.can_comment_on(uuid)',
    'execute'
  ),
  'privileges: anon cannot EXECUTE can_comment_on'
);

select phase8_sql_test.assert(
  not has_function_privilege(
    'anon',
    'public.can_view_profile(uuid)',
    'execute'
  ),
  'privileges: anon cannot EXECUTE can_view_profile'
);

select phase8_sql_test.assert(
  not has_function_privilege(
    'anon',
    'public.is_follower(uuid)',
    'execute'
  ),
  'privileges: anon cannot EXECUTE is_follower'
);

select phase8_sql_test.assert(
  not has_function_privilege(
    'anon',
    'public.has_follow_state(uuid)',
    'execute'
  ),
  'privileges: anon cannot EXECUTE has_follow_state'
);

select phase8_sql_test.assert(
  not has_function_privilege(
    'anon',
    'public.is_blocked_between(uuid, uuid)',
    'execute'
  ),
  'privileges: anon cannot EXECUTE is_blocked_between'
);

-- The two helpers that a client role must never reach: one derives a follow
-- status, the other DELETES follow edges.
select phase8_sql_test.assert(
  not has_function_privilege(
    'anon',
    'public.follow_status_for(uuid)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.follow_status_for(uuid)',
    'execute'
  ),
  'privileges: no client role can EXECUTE follow_status_for'
);

select phase8_sql_test.assert(
  not has_function_privilege(
    'anon',
    'public.user_blocks_cuts_follows()',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.user_blocks_cuts_follows()',
    'execute'
  ),
  'privileges: no client role can EXECUTE user_blocks_cuts_follows'
);

-- The session-free helpers ARE meant to be reachable by an anonymous visitor:
-- they are the qualifier of the anonymous profiles SELECT policy, and they
-- are how an unsigned-in visitor reads a profile's shell.
select phase8_sql_test.assert(
  has_function_privilege(
    'anon',
    'public.is_publicly_visible(uuid)',
    'execute'
  )
  and has_function_privilege(
    'anon',
    'public.profile_summary(uuid)',
    'execute'
  ),
  'privileges: anon can EXECUTE the session-free profile helpers'
);

-- The session-bound helpers must stay reachable by the role whose policies
-- call them: Postgres evaluates a policy with the QUERYING role's rights, so
-- `authenticated` cannot run the policies that use these without EXECUTE.
select phase8_sql_test.assert(
  has_function_privilege(
    'authenticated',
    'public.can_comment_on(uuid)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.can_view_profile(uuid)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.is_blocked_between(uuid, uuid)',
    'execute'
  ),
  'privileges: authenticated can EXECUTE the session-bound helpers'
);

-- The DEFAULT privileges themselves. A new function must not be callable by a
-- client role unless a migration grants it, so the leak cannot come back
-- through the next migration that adds a function.
--
-- This is asserted BEHAVIOURALLY rather than by reading the catalogue: a
-- throwaway function is created, the privilege is asked about, and the
-- function is dropped again. Reading `pg_default_acl` would only prove that
-- one entry looks a certain way, and it would also fail for an entry owned
-- by a role this project cannot change (`supabase_admin`), which says
-- nothing about what a function created by THIS migration inherits.
--
-- The probe lives in `public` rather than in the test schema, because that
-- is where the project's own functions live and therefore where the default
-- privileges being asserted are the ones that apply.
--
create or replace function public.phase8_probe_default_acl()
returns boolean
language sql
as $probe$
  select has_function_privilege(
    'anon',
    'public.phase8_probe_default_acl()',
    'execute'
  );
$probe$;

select phase8_sql_test.assert(
  not public.phase8_probe_default_acl(),
  'privileges: a new function is not executable by a client role by default'
);

drop function if exists public.phase8_probe_default_acl();

-- =============================================================================
-- 4. FOLLOWING A PUBLIC ACCOUNT
-- =============================================================================
--
-- The follow is immediate: the edge is `accepted`, the follower count goes
-- up, and following does NOT create the reverse edge.
-- =============================================================================

begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

insert into public.follows (follower_id, following_id, status)
values (
  'c3333333-3333-3333-3333-333333333333',
  'a1111111-1111-1111-1111-111111111111',
  'accepted'
);

select phase8_sql_test.assert(
  public.is_follower('a1111111-1111-1111-1111-111111111111'),
  'follow: carol is a follower of the public profile alice'
);

select phase8_sql_test.assert(
  not exists (
    select 1 from public.follows
    where follower_id = 'a1111111-1111-1111-1111-111111111111'
      and following_id = 'c3333333-3333-3333-3333-333333333333'
  ),
  'follow: following alice did NOT make alice follow carol back'
);

select phase8_sql_test.assert(
  (select count(*) from public.follows
   where following_id = 'a1111111-1111-1111-1111-111111111111'
     and status = 'accepted') = 1,
  'follow: the follower count counts the accepted edge'
);

rollback;

-- =============================================================================
-- 5. A DUPLICATE FOLLOW IS REFUSED
-- =============================================================================
--
-- The UNIQUE constraint is the guarantee. A second insert for the same pair
-- fails, so two tabs pressing Follow at once cannot produce two edges.
-- =============================================================================

begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

insert into public.follows (follower_id, following_id, status)
values (
  'c3333333-3333-3333-3333-333333333333',
  'a1111111-1111-1111-1111-111111111111',
  'accepted'
);

do $$
begin
  begin
    insert into public.follows (follower_id, following_id, status)
    values (
      'c3333333-3333-3333-3333-333333333333',
      'a1111111-1111-1111-1111-111111111111',
      'accepted'
    );
    raise exception 'the duplicate follow was NOT refused';
  exception when unique_violation then
    null;
  end;
end;
$$;

select phase8_sql_test.assert(
  (select count(*) from public.follows
   where follower_id = 'c3333333-3333-3333-3333-333333333333'
     and following_id = 'a1111111-1111-1111-1111-111111111111') = 1,
  'follow: a duplicate follow is refused and leaves ONE edge'
);

rollback;

-- =============================================================================
-- 6. A SELF-FOLLOW IS REFUSED
-- =============================================================================

begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

do $$
begin
  begin
    insert into public.follows (follower_id, following_id, status)
    values (
      'c3333333-3333-3333-3333-333333333333',
      'c3333333-3333-3333-3333-333333333333',
      'accepted'
    );
    raise exception 'the self-follow was NOT refused';
  exception when check_violation or insufficient_privilege then
    null;
  end;
end;
$$;

select phase8_sql_test.assert(
  not exists (
    select 1 from public.follows
    where follower_id = 'c3333333-3333-3333-3333-333333333333'
      and following_id = 'c3333333-3333-3333-3333-333333333333'
  ),
  'follow: a self-follow is refused'
);

rollback;

-- =============================================================================
-- 7. A CALLER CANNOT FOLLOW ON SOMEBODY ELSE'S BEHALF
-- =============================================================================
--
-- The INSERT policy binds `follower_id` to the session. A crafted insert
-- naming another account as the follower is refused.
-- =============================================================================

begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

do $$
begin
  begin
    insert into public.follows (follower_id, following_id, status)
    values (
      'a1111111-1111-1111-1111-111111111111',
      'b2222222-2222-2222-2222-222222222222',
      'accepted'
    );
    raise exception 'a follow on another account''s behalf was NOT refused';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

select phase8_sql_test.assert(
  not exists (
    select 1 from public.follows
    where follower_id = 'a1111111-1111-1111-1111-111111111111'
      and following_id = 'b2222222-2222-2222-2222-222222222222'
  ),
  'follow: a caller cannot create a follow edge for another account'
);

rollback;

-- =============================================================================
-- 8. THE FOLLOW REQUEST FLOW ON A PRIVATE ACCOUNT
-- =============================================================================
--
-- The requester creates a PENDING edge. The owner approves it. A pending
-- request is not a follower and is not counted as one.
-- =============================================================================

begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

-- The request.
insert into public.follows (follower_id, following_id, status)
values (
  'c3333333-3333-3333-3333-333333333333',
  'b2222222-2222-2222-2222-222222222222',
  'pending'
);

select phase8_sql_test.assert(
  not public.is_follower('b2222222-2222-2222-2222-222222222222'),
  'request: a PENDING requester is NOT a follower'
);

select phase8_sql_test.assert(
  (select count(*) from public.follows
   where following_id = 'b2222222-2222-2222-2222-222222222222'
     and status = 'accepted') = 0,
  'request: a pending request is NOT counted in the follower count'
);

select phase8_sql_test.assert(
  public.has_follow_state('b2222222-2222-2222-2222-222222222222') = 'pending',
  'request: the follow state reports pending, so the button can say Requested'
);

-- The requester CANNOT approve their own request.
do $$
begin
  begin
    update public.follows
    set status = 'accepted'
    where follower_id = 'c3333333-3333-3333-3333-333333333333'
      and following_id = 'b2222222-2222-2222-2222-222222222222';
    raise exception 'the requester approved their OWN request';
  exception when others then
    if sqlerrm not like '%not allowed%' then
      raise;
    end if;
  end;
end;
$$;

select phase8_sql_test.assert(
  (select status from public.follows
   where follower_id = 'c3333333-3333-3333-3333-333333333333'
     and following_id = 'b2222222-2222-2222-2222-222222222222') = 'pending',
  'request: a requester cannot approve their own request'
);

rollback;

-- The owner approves.
--
-- TWO SESSIONS IN ONE BLOCK.
--
-- The request is created by the REQUESTER, and it is approved by the OWNER.
-- Those are two different people, so the claims have to change in the middle
-- of the block. `auth.uid()` is what the trigger reads, so switching the
-- claims IS what grants the approval — there is no other way to say "this
-- update came from the owner" inside one transaction.
begin;
set local role authenticated;

-- The REQUESTER asks to follow.
select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

insert into public.follows (follower_id, following_id, status)
values (
  'c3333333-3333-3333-3333-333333333333',
  'b2222222-2222-2222-2222-222222222222',
  'pending'
);

-- The OWNER approves it.
select set_config(
  'request.jwt.claims',
  '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

update public.follows
set status = 'accepted'
where follower_id = 'c3333333-3333-3333-3333-333333333333'
  and following_id = 'b2222222-2222-2222-2222-222222222222';

-- And the REQUESTER is now a follower.
select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

select phase8_sql_test.assert(
  public.is_follower('b2222222-2222-2222-2222-222222222222'),
  'request: the owner approving makes the requester a follower'
);

select phase8_sql_test.assert(
  (select count(*) from public.follows
   where following_id = 'b2222222-2222-2222-2222-222222222222'
     and status = 'accepted') = 1,
  'request: the approved follower is counted'
);

rollback;

-- The owner declines.
begin;
set local role authenticated;

-- The REQUESTER asks to follow.
select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

insert into public.follows (follower_id, following_id, status)
values (
  'c3333333-3333-3333-3333-333333333333',
  'b2222222-2222-2222-2222-222222222222',
  'pending'
);

-- The OWNER declines it.
select set_config(
  'request.jwt.claims',
  '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

update public.follows
set status = 'declined'
where follower_id = 'c3333333-3333-3333-3333-333333333333'
  and following_id = 'b2222222-2222-2222-2222-222222222222';

-- The REQUESTER is not a follower.
select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

select phase8_sql_test.assert(
  not public.is_follower('b2222222-2222-2222-2222-222222222222'),
  'request: a declined requester is NOT a follower'
);

select phase8_sql_test.assert(
  public.has_follow_state('b2222222-2222-2222-2222-222222222222') = 'declined',
  'request: the follow state reports declined'
);

rollback;

-- The requester withdraws.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

insert into public.follows (follower_id, following_id, status)
values (
  'c3333333-3333-3333-3333-333333333333',
  'b2222222-2222-2222-2222-222222222222',
  'pending'
);

update public.follows
set status = 'cancelled'
where follower_id = 'c3333333-3333-3333-3333-333333333333'
  and following_id = 'b2222222-2222-2222-2222-222222222222';

select phase8_sql_test.assert(
  public.has_follow_state('b2222222-2222-2222-2222-222222222222') = 'cancelled',
  'request: the requester can withdraw their own request'
);

rollback;

-- =============================================================================
-- 9. THE STATE MACHINE
-- =============================================================================
--
-- A declined request can never become an accepted follow. This is what stops
-- a declined requester from buying their way in, and it is a TRIGGER rule —
-- an RLS policy cannot express it, because a policy's `with check` sees only
-- the new row and never the old one.
-- =============================================================================

begin;
set local role authenticated;

-- The REQUESTER asks to follow.
select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

insert into public.follows (follower_id, following_id, status)
values (
  'c3333333-3333-3333-3333-333333333333',
  'b2222222-2222-2222-2222-222222222222',
  'pending'
);

-- The OWNER declines it.
select set_config(
  'request.jwt.claims',
  '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

update public.follows
set status = 'declined'
where follower_id = 'c3333333-3333-3333-3333-333333333333'
  and following_id = 'b2222222-2222-2222-2222-222222222222';

-- And now try to revive it.
--
-- Even the OWNER cannot turn a declined request into an accepted follow. The
-- transition graph says `declined` is terminal, so the second attempt is
-- refused no matter who asks.
do $$
begin
  begin
    update public.follows
    set status = 'accepted'
    where follower_id = 'c3333333-3333-3333-3333-333333333333'
      and following_id = 'b2222222-2222-2222-2222-222222222222';
    raise exception 'a DECLINED request was revived into an accepted follow';
  exception when others then
    if sqlerrm not like '%not allowed%' then
      raise;
    end if;
  end;
end;
$$;

select phase8_sql_test.assert(
  (select status from public.follows
   where follower_id = 'c3333333-3333-3333-3333-333333333333'
     and following_id = 'b2222222-2222-2222-2222-222222222222') = 'declined',
  'state machine: a declined request cannot be revived into a follow'
);

rollback;

-- An edge's identity is immutable.
begin;
set local role authenticated;

-- The REQUESTER asks to follow.
select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

insert into public.follows (follower_id, following_id, status)
values (
  'c3333333-3333-3333-3333-333333333333',
  'b2222222-2222-2222-2222-222222222222',
  'pending'
);

-- The OWNER tries to re-point the edge at a different account.
select set_config(
  'request.jwt.claims',
  '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

do $$
begin
  begin
    update public.follows
    set following_id = 'd4444444-4444-4444-4444-444444444444'
    where follower_id = 'c3333333-3333-3333-3333-333333333333'
      and following_id = 'b2222222-2222-2222-2222-222222222222';
    raise exception 'a follow edge was re-pointed at a different account';
  exception when others then
    if sqlerrm not like '%cannot be re-pointed%' then
      raise;
    end if;
  end;
end;
$$;

select phase8_sql_test.assert(
  not exists (
    select 1 from public.follows
    where following_id = 'd4444444-4444-4444-4444-444444444444'
  ),
  'state machine: a follow edge cannot be re-pointed at a different account'
);

rollback;

-- =============================================================================
-- 10. THE PRIVATE PROFILE ACCESS RULE
-- =============================================================================
--
-- A private profile is readable by its owner and its APPROVED FOLLOWERS. A
-- pending request is not enough.
-- =============================================================================

begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

-- Carol has a PENDING request on bob's private profile.
insert into public.follows (follower_id, following_id, status)
values (
  'c3333333-3333-3333-3333-333333333333',
  'b2222222-2222-2222-2222-222222222222',
  'pending'
);

select phase8_sql_test.assert(
  not public.can_view_profile('b2222222-2222-2222-2222-222222222222'),
  'privacy: a pending requester cannot see a private profile'
);

-- The private profile's ROW is not readable either.
select phase8_sql_test.assert(
  (select count(*) from public.profiles
   where user_id = 'b2222222-2222-2222-2222-222222222222') = 0,
  'privacy: a pending requester cannot read the private profile row'
);

-- But the SHELL is readable, so the account is discoverable and followable.
select phase8_sql_test.assert(
  public.profile_summary('b2222222-2222-2222-2222-222222222222') is not null,
  'privacy: a visitor can read the shell of a private profile'
);

-- The shell must NOT carry the profile's content.
select phase8_sql_test.assert(
  not (public.profile_summary('b2222222-2222-2222-2222-222222222222')
    ? 'profile_state'),
  'privacy: the profile shell does not carry the profile content'
);

-- The shell's counts are the real counts, and a pending request is not one.
select phase8_sql_test.assert(
  (public.profile_summary('b2222222-2222-2222-2222-222222222222') ->> 'followerCount')::int = 0,
  'privacy: the shell reports zero followers while the request is pending'
);

rollback;

-- The same, with the request APPROVED.
begin;
set local role authenticated;

-- The REQUESTER asks to follow.
select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

insert into public.follows (follower_id, following_id, status)
values (
  'c3333333-3333-3333-3333-333333333333',
  'b2222222-2222-2222-2222-222222222222',
  'pending'
);

-- The OWNER approves it.
select set_config(
  'request.jwt.claims',
  '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

update public.follows
set status = 'accepted'
where follower_id = 'c3333333-3333-3333-3333-333333333333'
  and following_id = 'b2222222-2222-2222-2222-222222222222';

-- And the REQUESTER can now see the private profile.
select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

select phase8_sql_test.assert(
  public.can_view_profile('b2222222-2222-2222-2222-222222222222'),
  'privacy: an approved follower can see a private profile'
);

select phase8_sql_test.assert(
  (select count(*) from public.profiles
   where user_id = 'b2222222-2222-2222-2222-222222222222') = 1,
  'privacy: an approved follower can read the private profile row'
);

rollback;

-- An anonymous visitor cannot see a private profile.
begin;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select phase8_sql_test.assert(
  (select count(*) from public.profiles
   where user_id = 'b2222222-2222-2222-2222-222222222222') = 0,
  'privacy: an anonymous visitor cannot read a private profile row'
);

select phase8_sql_test.assert(
  (select count(*) from public.profiles
   where user_id = 'a1111111-1111-1111-1111-111111111111') = 1,
  'privacy: an anonymous visitor CAN read a public profile'
);

rollback;

-- =============================================================================
-- 11. COMMENTS
-- =============================================================================

-- A stranger may comment on a PUBLIC profile.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

select phase8_sql_test.assert(
  public.can_comment_on('a1111111-1111-1111-1111-111111111111'),
  'comments: a signed-in visitor may comment on a public profile'
);

insert into public.profile_comments (author_id, profile_id, body)
values (
  'c3333333-3333-3333-3333-333333333333',
  'a1111111-1111-1111-1111-111111111111',
  'A first comment.'
);

select phase8_sql_test.assert(
  (select count(*) from public.profile_comments
   where author_id = 'c3333333-3333-3333-3333-333333333333') = 1,
  'comments: the comment was written'
);

rollback;

-- A stranger may NOT comment on a PRIVATE profile.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

select phase8_sql_test.assert(
  not public.can_comment_on('b2222222-2222-2222-2222-222222222222'),
  'comments: a stranger may NOT comment on a private profile'
);

do $$
begin
  begin
    insert into public.profile_comments (author_id, profile_id, body)
    values (
      'c3333333-3333-3333-3333-333333333333',
      'b2222222-2222-2222-2222-222222222222',
      'Sneaking in.'
    );
    raise exception 'a comment on a private profile was NOT refused';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

select phase8_sql_test.assert(
  (select count(*) from public.profile_comments
   where profile_id = 'b2222222-2222-2222-2222-222222222222') = 0,
  'comments: no comment reached the private profile'
);

rollback;

-- An APPROVED FOLLOWER may comment on a PRIVATE profile. A PENDING one may not.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

insert into public.follows (follower_id, following_id, status)
values (
  'c3333333-3333-3333-3333-333333333333',
  'b2222222-2222-2222-2222-222222222222',
  'pending'
);

select phase8_sql_test.assert(
  not public.can_comment_on('b2222222-2222-2222-2222-222222222222'),
  'comments: a PENDING requester may not comment on a private profile'
);

rollback;

begin;
set local role authenticated;

-- The REQUESTER asks to follow.
select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

insert into public.follows (follower_id, following_id, status)
values (
  'c3333333-3333-3333-3333-333333333333',
  'b2222222-2222-2222-2222-222222222222',
  'pending'
);

-- The OWNER approves it.
select set_config(
  'request.jwt.claims',
  '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

update public.follows
set status = 'accepted'
where follower_id = 'c3333333-3333-3333-3333-333333333333'
  and following_id = 'b2222222-2222-2222-2222-222222222222';

-- And the APPROVED FOLLOWER may comment on the private profile.
select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

select phase8_sql_test.assert(
  public.can_comment_on('b2222222-2222-2222-2222-222222222222'),
  'comments: an APPROVED follower may comment on a private profile'
);

rollback;

-- An empty comment is refused, and an over-long one is too.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

do $$
begin
  begin
    insert into public.profile_comments (author_id, profile_id, body)
    values (
      'c3333333-3333-3333-3333-333333333333',
      'a1111111-1111-1111-1111-111111111111',
      '   '
    );
    raise exception 'an EMPTY comment was NOT refused';
  exception when check_violation then
    null;
  end;
end;
$$;

do $$
begin
  begin
    insert into public.profile_comments (author_id, profile_id, body)
    values (
      'c3333333-3333-3333-3333-333333333333',
      'a1111111-1111-1111-1111-111111111111',
      repeat('x', 1001)
    );
    raise exception 'an OVER-LONG comment was NOT refused';
  exception when check_violation then
    null;
  end;
end;
$$;

select phase8_sql_test.assert(
  (select count(*) from public.profile_comments
   where author_id = 'c3333333-3333-3333-3333-333333333333') = 0,
  'comments: an empty comment and an over-long comment are both refused'
);

rollback;
-- The POSTING RATE LIMIT.
--
-- A burst of comments from ONE account is refused. The limit is per AUTHOR,
-- not per profile, because the thing being prevented is one account spraying
-- comments across many profiles — a per-profile limit would let exactly that
-- through.
--
-- The guard is a TRIGGER, so it fires for every insert whoever makes it,
-- including a crafted PostgREST request that never touches this
-- application's code. An application-only limit would bound the
-- application's own users and nobody else, because the published key is
-- public.
--
begin;
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

-- The author posts comments until the limit refuses one.
--
-- The count is driven by the limit itself rather than a hard-coded number, so
-- a change to the limit does not silently invalidate the assertion.
do $probe$
declare
  limit_value integer := public.comment_rate_limit();
  posted integer := 0;
  refused boolean := false;
begin
  for i in 1..(limit_value + 2) loop
    begin
      insert into public.profile_comments (author_id, profile_id, body)
      values (
        'c3333333-3333-3333-3333-333333333333',
        'a1111111-1111-1111-1111-111111111111',
        'Burst ' || i
      );
      posted := posted + 1;
    exception when others then
      refused := true;
      exit;
    end;
  end loop;

  if not refused then
    raise exception 'the comment rate limit did NOT refuse a burst';
  end if;

  if posted > limit_value then
    raise exception 'the comment rate limit allowed % comments, over the limit of %',
      posted, limit_value;
  end if;
end;
$probe$;

select phase8_sql_test.assert(
  (select count(*) from public.profile_comments
   where author_id = 'c3333333-3333-3333-3333-333333333333') <= public.comment_rate_limit(),
  'comments: a burst of comments from one account is refused'
);

rollback;

-- A caller may not edit or delete somebody else's comment.
begin;
set local role authenticated;

-- ALICE writes a comment on CAROL's public profile.
--
-- The author must be the caller, or the insert is refused — so the comment is
-- written while the claims name alice.
select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);


insert into public.profile_comments (author_id, profile_id, body)
values (
  'a1111111-1111-1111-1111-111111111111',
  'c3333333-3333-3333-3333-333333333333',
  'Owner comment on a public profile.'
);

-- CAROL tries to edit it.
--
-- A refused UPDATE affects ZERO rows rather than raising: from the caller's
-- point of view the row simply was not there. So the attempt is made, and the
-- assertion is that the row is UNCHANGED — which is the shape the project's
-- other RLS suites already use.
select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

update public.profile_comments
set body = 'Hijacked.'
where author_id = 'a1111111-1111-1111-1111-111111111111';

select phase8_sql_test.assert(
  (select body from public.profile_comments
   where author_id = 'a1111111-1111-1111-1111-111111111111') = 'Owner comment on a public profile.',
  'comments: a caller cannot edit another account''s comment'
);


-- The PROFILE OWNER can delete a comment on their own profile.
begin;
set local role authenticated;

-- CAROL writes a comment on alice's public profile.
select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

insert into public.profile_comments (author_id, profile_id, body)
values (
  'c3333333-3333-3333-3333-333333333333',
  'a1111111-1111-1111-1111-111111111111',
  'A comment on alice''s public profile.'
);

-- And ALICE, who owns the profile, deletes it.
select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

delete from public.profile_comments
where author_id = 'c3333333-3333-3333-3333-333333333333'
  and profile_id = 'a1111111-1111-1111-1111-111111111111';

select phase8_sql_test.assert(
  (select count(*) from public.profile_comments
   where profile_id = 'a1111111-1111-1111-1111-111111111111') = 0,
  'comments: the profile owner can delete a comment on their own profile'
);

rollback;

-- =============================================================================
-- 12. BLOCKS
-- =============================================================================
--
-- A block is one-directional and it never announces itself: the blocked
-- account cannot see the block row, and the block cuts the follow edge
-- between the pair.
-- =============================================================================

begin;
set local role authenticated;

-- CAROL follows alice.
select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

insert into public.follows (follower_id, following_id, status)
values (
  'c3333333-3333-3333-3333-333333333333',
  'a1111111-1111-1111-1111-111111111111',
  'accepted'
);

-- ALICE blocks carol, which CUTS the edge between them.
select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

insert into public.user_blocks (blocker_id, blocked_id)
values (
  'a1111111-1111-1111-1111-111111111111',
  'c3333333-3333-3333-3333-333333333333'
);

select phase8_sql_test.assert(
  public.is_blocked_between(
    'a1111111-1111-1111-1111-111111111111',
    'c3333333-3333-3333-3333-333333333333'
  ),
  'blocks: the block is visible to the blocker'
);

-- And the follow edge is GONE, in both directions.
select phase8_sql_test.assert(
  not exists (
    select 1 from public.follows
    where follower_id = 'c3333333-3333-3333-3333-333333333333'
      and following_id = 'a1111111-1111-1111-1111-111111111111'
  ),
  'blocks: a block cuts the follow edge between the pair'
);

rollback;

-- The blocked account cannot see the block.
begin;
set local role authenticated;

-- ALICE blocks carol.
select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

insert into public.user_blocks (blocker_id, blocked_id)
values (
  'a1111111-1111-1111-1111-111111111111',
  'c3333333-3333-3333-3333-333333333333'
);

-- And CAROL cannot see it, cannot follow back, cannot comment, and cannot
-- see a private profile.
select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

select phase8_sql_test.assert(
  (select count(*) from public.user_blocks
   where blocked_id = 'c3333333-3333-3333-3333-333333333333') = 0,
  'blocks: the blocked account cannot see that it has been blocked'
);

-- And the block is still enforced for them — the helper is SECURITY
-- DEFINER precisely so that the blocker's RLS does not hide the block from
-- the predicate that has to enforce it.
select phase8_sql_test.assert(
  public.is_blocked_between(
    'a1111111-1111-1111-1111-111111111111',
    'c3333333-3333-3333-3333-333333333333'
  ),
  'blocks: the block is still enforced against the blocked account'
);

-- A blocked account cannot follow the blocker.
do $$
begin
  begin
    insert into public.follows (follower_id, following_id, status)
    values (
      'c3333333-3333-3333-3333-333333333333',
      'a1111111-1111-1111-1111-111111111111',
      'accepted'
    );
    raise exception 'a blocked account was allowed to follow the blocker';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

select phase8_sql_test.assert(
  not exists (
    select 1 from public.follows
    where follower_id = 'c3333333-3333-3333-3333-333333333333'
      and following_id = 'a1111111-1111-1111-1111-111111111111'
  ),
  'blocks: a blocked account cannot follow the blocker'
);

-- And cannot comment on the blocker's profile.
select phase8_sql_test.assert(
  not public.can_comment_on('a1111111-1111-1111-1111-111111111111'),
  'blocks: a blocked account cannot comment on the blocker''s profile'
);

-- And cannot see a private profile.
--
-- The visibility is changed by ALICE, because alice owns the profile.
select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

update public.profiles
set visibility = 'private'
where user_id = 'a1111111-1111-1111-1111-111111111111';

-- And CAROL still cannot see it.
select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

select phase8_sql_test.assert(
  not public.can_view_profile('a1111111-1111-1111-1111-111111111111'),
  'blocks: a blocked account cannot see a private profile'
);

-- Put the profile back, as alice.
select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

update public.profiles
set visibility = 'public'
where user_id = 'a1111111-1111-1111-1111-111111111111';

rollback;

-- A caller cannot block on somebody else's behalf.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);


do $$
begin
  begin
    insert into public.user_blocks (blocker_id, blocked_id)
    values (
      'a1111111-1111-1111-1111-111111111111',
      'b2222222-2222-2222-2222-222222222222'
    );
    raise exception 'a caller created a block on another account''s behalf';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

select phase8_sql_test.assert(
  not exists (
    select 1 from public.user_blocks
    where blocker_id = 'a1111111-1111-1111-1111-111111111111'
      and blocked_id = 'b2222222-2222-2222-2222-222222222222'
  ),
  'blocks: a caller cannot create a block for another account'
);

rollback;

-- =============================================================================
-- 13. REPORTS
-- =============================================================================

begin;
set local role authenticated;

-- The REPORTED account is alice, and the REPORTER is carol.
select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

insert into public.content_reports (reporter_id, profile_id, reason, details)
values (
  'c3333333-3333-3333-3333-333333333333',
  'a1111111-1111-1111-1111-111111111111',
  'spam',
  'Not what it claims to be.'
);

select phase8_sql_test.assert(
  (select count(*) from public.content_reports
   where reporter_id = 'c3333333-3333-3333-3333-333333333333') = 1,
  'reports: the report was stored'
);

rollback;

-- The REPORTED account cannot see the report. A report that notifies its
-- subject is a notice, not a report.
begin;
set local role authenticated;

-- CAROL writes a comment on alice's public profile.
select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

insert into public.profile_comments (author_id, profile_id, body)
values (
  'c3333333-3333-3333-3333-333333333333',
  'a1111111-1111-1111-1111-111111111111',
  'A comment to report.'
);

-- And CAROL reports it.
insert into public.content_reports (reporter_id, comment_id, reason)
values (
  'c3333333-3333-3333-3333-333333333333',
  (select id from public.profile_comments limit 1),
  'harassment'
);

-- ALICE is the reported account, and she cannot see the report.
select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

select phase8_sql_test.assert(
  (select count(*) from public.content_reports) = 0,
  'reports: the reported account cannot see that it was reported'
);

rollback;

rollback;
rollback;

-- =============================================================================
-- 14. CROSS-ACCOUNT ISOLATION
-- =============================================================================
--
-- The reads are scoped. Carol cannot see alice's follower list rows, and
-- cannot read alice's private profile.
-- =============================================================================

begin;
set local role authenticated;

-- DAVE follows alice.
select set_config(
  'request.jwt.claims',
  '{"sub":"d4444444-4444-4444-4444-444444444444","role":"authenticated"}',
  true
);

insert into public.follows (follower_id, following_id, status)
values (
  'd4444444-4444-4444-4444-444444444444',
  'a1111111-1111-1111-1111-111111111111',
  'accepted'
);

-- Carol is neither end of that edge, so she cannot see it.
select set_config(
  'request.jwt.claims',
  '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

select phase8_sql_test.assert(
  (select count(*) from public.follows
   where follower_id = 'd4444444-4444-4444-4444-444444444444'
     and following_id = 'a1111111-1111-1111-1111-111111111111') = 0,
  'isolation: an unrelated account cannot read a follow edge it is not part of'
);

rollback;

-- =============================================================================
-- 15. CLEAN UP
-- =============================================================================
--
-- The fixture rows are removed by their own fixed ids. Nothing else is
-- touched: the RLS suite's accounts live in the same database and their rows
-- must survive.
-- =============================================================================

delete from public.content_reports
where reporter_id in (
  'a1111111-1111-1111-1111-111111111111',
  'b2222222-2222-2222-2222-222222222222',
  'c3333333-3333-3333-3333-333333333333',
  'd4444444-4444-4444-4444-444444444444'
);

delete from public.profile_comments
where author_id in (
  'a1111111-1111-1111-1111-111111111111',
  'b2222222-2222-2222-2222-222222222222',
  'c3333333-3333-3333-3333-333333333333',
  'd4444444-4444-4444-4444-444444444444'
);

delete from public.user_blocks
where blocker_id in (
  'a1111111-1111-1111-1111-111111111111',
  'b2222222-2222-2222-2222-222222222222',
  'c3333333-3333-3333-3333-333333333333',
  'd4444444-4444-4444-4444-444444444444'
);

delete from public.follows
where follower_id in (
  'a1111111-1111-1111-1111-111111111111',
  'b2222222-2222-2222-2222-222222222222',
  'c3333333-3333-3333-3333-333333333333',
  'd4444444-4444-4444-4444-444444444444'
);

-- =============================================================================
-- 16. THE SUMMARY
-- =============================================================================

select
  case
    when bool_and(passed) then 'PASS'
    else 'FAIL'
  end as outcome,
  count(*) as assertions,
  count(*) filter (where passed) as passed
from phase8_sql_test.results;

drop schema phase8_sql_test cascade;
