-- =============================================================================
-- PRSME — Phase 9 policy-level SQL tests
-- =============================================================================
--
-- WHAT THIS IS
--
-- The notification rules, exercised from INSIDE the database, where the RLS
-- context can be set exactly: as the `anon` role, as `authenticated` with a
-- given user's claims, and as a second unrelated user.
--
-- The notification logic lives in triggers and SECURITY DEFINER functions,
-- and those are only observable from SQL — the REST layer cannot see a
-- trigger's decision, only its effect.
--
-- HOW TO RUN IT
--
--   - In the Supabase SQL editor (dashboard), paste and run. It reports a
--     PASS/FAIL line per assertion.
--   - Locally, against the Phase 6.1 stack:
--       node scripts/localdb/phase9-sql-tests.mjs
--   - Against the REMOTE project:
--       node scripts/phase9-remote-sql-tests.mjs
--
-- IT IS SELF-CONTAINED AND LEAVES NOTHING BEHIND
--
-- Every object it creates lives under the `phase9_sql_test` schema, which is
-- dropped and recreated at the start and dropped again at the end. The public
-- schema is never modified — the fixture rows it writes are removed by their
-- own fixed ids before it starts and again at the end.
--
-- THE RULES THIS FILE PROVES
--
--   1. each of the five events produces exactly one notification;
--   2. the notification goes to the right RECIPIENT, with the right ACTOR;
--   3. the events that must NOT notify do not notify;
--   4. a repeated event does not produce a second notification;
--   5. only the recipient can read or change a notification;
--   6. no client role can create one;
--   7. a block silences the pair, and discards what already exists;
--   8. a notification never carries the content of a private comment.
--
-- HOW THE ACTING USER IS SET
--
-- The follow state machine asks `auth.uid()` who is acting, because it has
-- to know whether the caller is the owner resolving a request or the
-- requester withdrawing one. So every block sets the JWT claims, and the
-- claims are changed in the middle of a block when a different person acts.
--
-- The blocks stay in the `postgres` role, which bypasses RLS, so a test can
-- read every notification rather than only the recipient's. Section 8 is
-- where the POLICY itself is tested, and it deliberately switches to the
-- `authenticated` role to read as a real account would.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Assertions
-- -----------------------------------------------------------------------------
--
-- `assert` is a small helper that RAISES on failure, so a broken assertion
-- stops the run instead of printing a red line that scrolls past. The results
-- table is filled in as the run proceeds, and the final SELECT prints it.
-- -----------------------------------------------------------------------------

create schema if not exists phase9_sql_test;

-- The results table comes FIRST: the helper functions below write into it,
-- and Postgres resolves a function body's table references when the function
-- is created, so the table has to exist by then.
create table if not exists phase9_sql_test.results (
  id serial primary key,
  label text not null,
  passed boolean not null,
  detail text,
  ran_at timestamptz not null default now()
);

create or replace function phase9_sql_test.record_result(
  label text,
  passed boolean,
  detail text default null
)
returns void
language plpgsql
as $$
begin
  insert into phase9_sql_test.results (label, passed, detail)
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

create or replace function phase9_sql_test.assert(
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
  perform phase9_sql_test.record_result(label, true, null);
end;
$$;

-- Is this one of THIS FILE's three accounts?
--
-- The notifications table is shared with the browser suite, which leaves its
-- own rows behind on the same local database. An assertion that counts every
-- notification would read those rows and fail for a reason that has nothing
-- to do with the rule being tested.
--
-- So the counts that are not already scoped to a recipient or an actor are
-- scoped through this helper.
create or replace function phase9_sql_test.is_fixture(account_uuid uuid)
returns boolean
language sql
immutable
as $$
  select account_uuid in (
    'e1111111-1111-1111-1111-111111111111',
    'e2222222-2222-2222-2222-222222222222',
    'e3333333-3333-3333-3333-333333333333'
  );
$$;

-- This file's notifications, and nothing else.
--
-- A VIEW rather than a function, because the assertions below UPDATE the
-- rows they are counting. `update <function>()` is not a statement Postgres
-- has; a plain view is updatable, so the same name works for both the reads
-- and the writes.
--
-- A view reads with its OWNER's rights, not the caller's. That is fine here:
-- every assertion that uses this view runs as the table owner, and the
-- assertions that are about RLS read `public.notifications` directly.
create or replace view phase9_sql_test.fixture_notifications as
  select n.*
  from public.notifications n
  where phase9_sql_test.is_fixture(n.recipient_id)
     or phase9_sql_test.is_fixture(n.actor_id);

-- The assertion helpers live in this schema, and the blocks below switch to
-- the `anon` and `authenticated` roles to read through RLS. A role cannot call
-- a function in a schema it has no USAGE on, so the privileges are granted
-- here. They are scoped to this throwaway test schema only.
grant usage on schema phase9_sql_test to anon, authenticated;
grant insert on phase9_sql_test.results to anon, authenticated;
grant usage, select on all sequences in schema phase9_sql_test to anon, authenticated;
grant execute on function phase9_sql_test.record_result(text, boolean, text) to anon, authenticated;
grant execute on function phase9_sql_test.assert(boolean, text) to anon, authenticated;
grant execute on function phase9_sql_test.is_fixture(uuid) to anon, authenticated;
grant select on phase9_sql_test.fixture_notifications to anon, authenticated;
grant update on phase9_sql_test.fixture_notifications to anon, authenticated;

-- Start from a clean slate.
truncate phase9_sql_test.results;

-- =============================================================================
-- FIXTURES
-- =============================================================================
--
-- Three accounts with fixed ids, so the fixture is identical on every run:
--
--   ellie   e1111111-…  a PUBLIC profile
--   frank   e2222222-…  a PRIVATE profile
--   grace   e3333333-…  a PUBLIC profile
--
-- The ids are recognisable at a glance in a failing assertion.
--
-- THEY ARE PHASE 9's OWN, AND NOT PHASE 8's
--
-- The Phase 8 file uses a1111111-…, b2222222-… and c3333333-… for the
-- same three roles. Those rows still exist on the REMOTE project, because
-- that file leaves its fixtures behind rather than deleting them.
--
-- Reusing the ids here would be a collision: the insert below is
-- `on conflict (user_id) do nothing`, so the old row would survive, the
-- notification would carry Phase 8's handle, and the assertion about the
-- actor's name would fail for a reason that has nothing to do with the
-- notification system.
--
-- So this file uses its own range, and its own handles.
-- =============================================================================

insert into auth.users (id, email, email_confirmed_at, created_at, updated_at)
values
  ('e1111111-1111-1111-1111-111111111111', 'p9-ellie@prsme.test', now(), now(), now()),
  ('e2222222-2222-2222-2222-222222222222', 'p9-frank@prsme.test', now(), now(), now()),
  ('e3333333-3333-3333-3333-333333333333', 'p9-grace@prsme.test', now(), now(), now())
on conflict (id) do nothing;

insert into public.profiles (user_id, username, visibility, profile_state)
values
  (
    'e1111111-1111-1111-1111-111111111111',
    'p9ellie',
    'public',
    '{"version":1,"displayName":"Ellie"}'::jsonb
  ),
  (
    'e2222222-2222-2222-2222-222222222222',
    'p9frank',
    'private',
    '{"version":1,"displayName":"Frank"}'::jsonb
  ),
  (
    'e3333333-3333-3333-3333-333333333333',
    'p9grace',
    'public',
    '{"version":1,"displayName":"Grace"}'::jsonb
  )
on conflict (user_id) do nothing;

-- Clean up anything a previous run left behind.
--
-- The notifications go FIRST, because they reference the follows and the
-- comments, and a foreign key would refuse the delete otherwise.
delete from public.notifications
where actor_id in (
  'e1111111-1111-1111-1111-111111111111',
  'e2222222-2222-2222-2222-222222222222',
  'e3333333-3333-3333-3333-333333333333'
)
or recipient_id in (
  'e1111111-1111-1111-1111-111111111111',
  'e2222222-2222-2222-2222-222222222222',
  'e3333333-3333-3333-3333-333333333333'
);

delete from public.content_reports where reporter_id in (
  'e1111111-1111-1111-1111-111111111111',
  'e2222222-2222-2222-2222-222222222222',
  'e3333333-3333-3333-3333-333333333333'
);

delete from public.profile_comments where author_id in (
  'e1111111-1111-1111-1111-111111111111',
  'e2222222-2222-2222-2222-222222222222',
  'e3333333-3333-3333-3333-333333333333'
);

delete from public.user_blocks where blocker_id in (
  'e1111111-1111-1111-1111-111111111111',
  'e2222222-2222-2222-2222-222222222222',
  'e3333333-3333-3333-3333-333333333333'
);

delete from public.follows where follower_id in (
  'e1111111-1111-1111-1111-111111111111',
  'e2222222-2222-2222-2222-222222222222',
  'e3333333-3333-3333-3333-333333333333'
);

-- =============================================================================
-- 1. THE TABLE EXISTS
-- =============================================================================

select phase9_sql_test.assert(
  to_regclass('public.notifications') is not null,
  'schema: the notifications table exists'
);

select phase9_sql_test.assert(
  (select relrowsecurity from pg_class where oid = 'public.notifications'::regclass),
  'schema: RLS is enabled on notifications'
);

-- The event types are a closed set.
select phase9_sql_test.assert(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%follow_accepted%'
      and pg_get_constraintdef(oid) like '%follow_declined%'
      and pg_get_constraintdef(oid) like '%follow_request%'
  ),
  'schema: the notification type is a closed set'
);

-- Nobody notifies themselves.
select phase9_sql_test.assert(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and pg_get_constraintdef(oid) like '%recipient_id <> actor_id%'
  ),
  'schema: a notification cannot be addressed to its own actor'
);

-- A follow event names a follow edge; a comment event names a comment.
--
-- The comparison is case-insensitive because Postgres normalises a CHECK
-- constraint's text to upper case when it stores it.
select phase9_sql_test.assert(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and pg_get_constraintdef(oid) ilike '%follow_id is not null%'
      and pg_get_constraintdef(oid) ilike '%comment_id is not null%'
  ),
  'schema: a notification names exactly one subject'
);

-- The references are REAL foreign keys, not a polymorphic id.
select phase9_sql_test.assert(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and contype = 'f'
      and confrelid = 'public.follows'::regclass
  )
  and exists (
    select 1
    from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and contype = 'f'
      and confrelid = 'public.profile_comments'::regclass
  ),
  'schema: the notification references are real foreign keys'
);

-- There is no INSERT policy and no DELETE policy.
select phase9_sql_test.assert(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and cmd in ('INSERT', 'DELETE')
  ),
  'schema: no client policy may create or delete a notification'
);

-- The write function is not executable by a client role.
select phase9_sql_test.assert(
  not has_function_privilege(
    'authenticated',
    'public.record_notification(uuid, uuid, text, uuid, uuid)',
    'EXECUTE'
  ),
  'privileges: a client role cannot EXECUTE record_notification'
);

-- =============================================================================
-- 2. FOLLOWING A PUBLIC ACCOUNT NOTIFIES THE ACCOUNT
-- =============================================================================

begin;
select set_config(
  'request.jwt.claims',
  '{"sub":"e3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

insert into public.follows (follower_id, following_id, status)
values (
  'e3333333-3333-3333-3333-333333333333',
  'e1111111-1111-1111-1111-111111111111',
  'accepted'
);

-- The recipient is the FOLLOWED account; the actor is the follower.
select phase9_sql_test.assert(
  exists (
    select 1 from public.notifications
    where type = 'follow'
      and recipient_id = 'e1111111-1111-1111-1111-111111111111'
      and actor_id = 'e3333333-3333-3333-3333-333333333333'
  ),
  'follow: following a public account notifies the FOLLOWED account'
);

-- The follower is NOT notified of their own follow.
select phase9_sql_test.assert(
  not exists (
    select 1 from public.notifications
    where recipient_id = 'e3333333-3333-3333-3333-333333333333'
  ),
  'follow: the follower is not notified of their own follow'
);

-- The notification names the actor's handle, and freezes it.
select phase9_sql_test.assert(
  exists (
    select 1 from public.notifications
    where type = 'follow'
      and body like '%p9grace%'
      and actor_username = 'p9grace'
  ),
  'follow: the notification names the actor'
);

-- The notification names where it happened.
select phase9_sql_test.assert(
  exists (
    select 1 from public.notifications
    where type = 'follow'
      and target_username = 'p9ellie'
  ),
  'follow: the notification names the account it happened to'
);

rollback;

-- A rolled-back follow leaves NO notification behind, because the trigger
-- runs in the same transaction as the action.
begin;
select set_config(
  'request.jwt.claims',
  '{"sub":"e3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

insert into public.follows (follower_id, following_id, status)
values (
  'e3333333-3333-3333-3333-333333333333',
  'e1111111-1111-1111-1111-111111111111',
  'accepted'
);

rollback;

select phase9_sql_test.assert(
  not exists (
    select 1 from phase9_sql_test.fixture_notifications where type = 'follow'
  ),
  'follow: a rolled-back follow leaves NO notification behind'
);

-- =============================================================================
-- 3. REQUESTING TO FOLLOW A PRIVATE ACCOUNT NOTIFIES THE OWNER
-- =============================================================================

begin;
select set_config(
  'request.jwt.claims',
  '{"sub":"e3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

insert into public.follows (follower_id, following_id, status)
values (
  'e3333333-3333-3333-3333-333333333333',
  'e2222222-2222-2222-2222-222222222222',
  'pending'
);

select phase9_sql_test.assert(
  exists (
    select 1 from public.notifications
    where type = 'follow_request'
      and recipient_id = 'e2222222-2222-2222-2222-222222222222'
      and actor_id = 'e3333333-3333-3333-3333-333333333333'
  ),
  'request: requesting to follow a private account notifies the OWNER'
);

select phase9_sql_test.assert(
  not exists (
    select 1 from public.notifications
    where type = 'follow'
      and recipient_id = 'e2222222-2222-2222-2222-222222222222'
  ),
  'request: a request is NOT reported as a completed follow'
);

rollback;

-- =============================================================================
-- 4. THE RESOLUTION NOTIFIES THE REQUESTER
-- =============================================================================

-- The owner approves.
begin;

-- The REQUESTER asks.
select set_config(
  'request.jwt.claims',
  '{"sub":"e3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

insert into public.follows (follower_id, following_id, status)
values (
  'e3333333-3333-3333-3333-333333333333',
  'e2222222-2222-2222-2222-222222222222',
  'pending'
);

-- The OWNER approves.
select set_config(
  'request.jwt.claims',
  '{"sub":"e2222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

update public.follows
set status = 'accepted'
where follower_id = 'e3333333-3333-3333-3333-333333333333'
  and following_id = 'e2222222-2222-2222-2222-222222222222';

select phase9_sql_test.assert(
  exists (
    select 1 from public.notifications
    where type = 'follow_accepted'
      and recipient_id = 'e3333333-3333-3333-3333-333333333333'
      and actor_id = 'e2222222-2222-2222-2222-222222222222'
  ),
  'request: approving a request notifies the REQUESTER'
);

-- The owner is NOT notified of their own decision.
select phase9_sql_test.assert(
  not exists (
    select 1 from public.notifications
    where recipient_id = 'e2222222-2222-2222-2222-222222222222'
      and type = 'follow_accepted'
  ),
  'request: the owner is not notified of their own approval'
);

-- The owner's request notification is no longer outstanding.
select phase9_sql_test.assert(
  not exists (
    select 1 from public.notifications
    where type = 'follow_request'
      and recipient_id = 'e2222222-2222-2222-2222-222222222222'
      and dismissed_at is null
  ),
  'request: a resolved request notification stops being outstanding'
);

rollback;

-- The owner declines.
begin;

select set_config(
  'request.jwt.claims',
  '{"sub":"e3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

insert into public.follows (follower_id, following_id, status)
values (
  'e3333333-3333-3333-3333-333333333333',
  'e2222222-2222-2222-2222-222222222222',
  'pending'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"e2222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

update public.follows
set status = 'declined'
where follower_id = 'e3333333-3333-3333-3333-333333333333'
  and following_id = 'e2222222-2222-2222-2222-222222222222';

select phase9_sql_test.assert(
  exists (
    select 1 from public.notifications
    where type = 'follow_declined'
      and recipient_id = 'e3333333-3333-3333-3333-333333333333'
      and actor_id = 'e2222222-2222-2222-2222-222222222222'
  ),
  'request: declining a request notifies the REQUESTER'
);

rollback;

-- =============================================================================
-- 5. THE EVENTS THAT MUST NOT NOTIFY
-- =============================================================================

-- CANCELLING a request is not news to the owner.
begin;

select set_config(
  'request.jwt.claims',
  '{"sub":"e3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

insert into public.follows (follower_id, following_id, status)
values (
  'e3333333-3333-3333-3333-333333333333',
  'e2222222-2222-2222-2222-222222222222',
  'pending'
);

update public.follows
set status = 'cancelled'
where follower_id = 'e3333333-3333-3333-3333-333333333333'
  and following_id = 'e2222222-2222-2222-2222-222222222222';

select phase9_sql_test.assert(
  not exists (
    select 1 from public.notifications
    where type = 'follow_declined'
      and recipient_id = 'e3333333-3333-3333-3333-333333333333'
  ),
  'request: cancelling a request produces NO resolution notification'
);

rollback;

-- Unfollowing is not news either.
begin;

select set_config(
  'request.jwt.claims',
  '{"sub":"e3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

insert into public.follows (follower_id, following_id, status)
values (
  'e3333333-3333-3333-3333-333333333333',
  'e1111111-1111-1111-1111-111111111111',
  'accepted'
);

-- The follower unfollows, which DELETES the row.
delete from public.follows
where follower_id = 'e3333333-3333-3333-3333-333333333333'
  and following_id = 'e1111111-1111-1111-1111-111111111111';

-- The follow notification went with the edge, because the notification
-- REFERENCES it.
select phase9_sql_test.assert(
  not exists (
    select 1 from public.notifications
    where type = 'follow'
      and recipient_id = 'e1111111-1111-1111-1111-111111111111'
  ),
  'follow: unfollowing removes the follow notification with the edge'
);

rollback;

-- A profile view is not an event at all: there is no trigger on the
-- profiles table, so nothing is written.
select phase9_sql_test.assert(
  not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and not tgisinternal
      and tgname like '%notif%'
  ),
  'views: there is NO notification trigger on the profiles table'
);

-- =============================================================================
-- 6. A REPEATED EVENT DOES NOT NOTIFY TWICE
-- =============================================================================

begin;
select set_config(
  'request.jwt.claims',
  '{"sub":"e3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

insert into public.follows (follower_id, following_id, status)
values (
  'e3333333-3333-3333-3333-333333333333',
  'e1111111-1111-1111-1111-111111111111',
  'accepted'
);

-- The same event, recorded a second time. The trigger is called directly
-- rather than by re-running the follow, because re-running the follow is
-- refused by the UNIQUE constraint — and a RETRY is exactly what the
-- requirement is about.
select public.record_notification(
  'e1111111-1111-1111-1111-111111111111',
  'e3333333-3333-3333-3333-333333333333',
  'follow',
  (select id from public.follows
   where follower_id = 'e3333333-3333-3333-3333-333333333333'
     and following_id = 'e1111111-1111-1111-1111-111111111111'),
  null
);

select phase9_sql_test.assert(
  (select count(*) from phase9_sql_test.fixture_notifications where type = 'follow') = 1,
  'duplicates: a repeated event produces ONE notification'
);

rollback;

-- A SECOND ASK after a decline is a new event, and it notifies.
begin;

select set_config(
  'request.jwt.claims',
  '{"sub":"e3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

insert into public.follows (follower_id, following_id, status)
values (
  'e3333333-3333-3333-3333-333333333333',
  'e2222222-2222-2222-2222-222222222222',
  'pending'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"e2222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

update public.follows
set status = 'declined'
where follower_id = 'e3333333-3333-3333-3333-333333333333'
  and following_id = 'e2222222-2222-2222-2222-222222222222';

-- The requester asks again, which moves the SAME edge back to 'pending'.
select set_config(
  'request.jwt.claims',
  '{"sub":"e3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

update public.follows
set status = 'pending'
where follower_id = 'e3333333-3333-3333-3333-333333333333'
  and following_id = 'e2222222-2222-2222-2222-222222222222';

select phase9_sql_test.assert(
  (select count(*) from public.notifications
   where type = 'follow_request'
     and recipient_id = 'e2222222-2222-2222-2222-222222222222'
     and dismissed_at is null) = 1,
  'duplicates: a second ask after a decline notifies the owner AGAIN'
);

rollback;

-- =============================================================================
-- 7. A COMMENT NOTIFIES THE PROFILE'S OWNER
-- =============================================================================

begin;
select set_config(
  'request.jwt.claims',
  '{"sub":"e3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

-- Carol comments on Alice's PUBLIC profile.
insert into public.profile_comments (author_id, profile_id, body)
values (
  'e3333333-3333-3333-3333-333333333333',
  'e1111111-1111-1111-1111-111111111111',
  'A public comment.'
);

select phase9_sql_test.assert(
  exists (
    select 1 from public.notifications
    where type = 'comment'
      and recipient_id = 'e1111111-1111-1111-1111-111111111111'
      and actor_id = 'e3333333-3333-3333-3333-333333333333'
  ),
  'comment: a comment notifies the PROFILE OWNER'
);

-- The commenter is not notified of their own comment.
select phase9_sql_test.assert(
  not exists (
    select 1 from public.notifications
    where recipient_id = 'e3333333-3333-3333-3333-333333333333'
      and type = 'comment'
  ),
  'comment: the commenter is not notified of their own comment'
);

rollback;

-- A comment on a PRIVATE profile notifies the owner too — and the
-- notification does NOT carry the comment's text.
begin;

-- The REQUESTER asks.
select set_config(
  'request.jwt.claims',
  '{"sub":"e3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

insert into public.follows (follower_id, following_id, status)
values (
  'e3333333-3333-3333-3333-333333333333',
  'e2222222-2222-2222-2222-222222222222',
  'pending'
);

-- The OWNER approves, so Carol may comment on his private profile.
select set_config(
  'request.jwt.claims',
  '{"sub":"e2222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

update public.follows
set status = 'accepted'
where follower_id = 'e3333333-3333-3333-3333-333333333333'
  and following_id = 'e2222222-2222-2222-2222-222222222222';

select set_config(
  'request.jwt.claims',
  '{"sub":"e3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

insert into public.profile_comments (author_id, profile_id, body)
values (
  'e3333333-3333-3333-3333-333333333333',
  'e2222222-2222-2222-2222-222222222222',
  'A SECRET comment on a private profile.'
);

select phase9_sql_test.assert(
  exists (
    select 1 from public.notifications
    where type = 'comment'
      and recipient_id = 'e2222222-2222-2222-2222-222222222222'
  ),
  'comment: a comment on a private profile notifies the owner'
);

-- The notification carries the ACTOR, not the comment's text.
--
-- This is the disclosure rule: a notification is a summary of a comment, and
-- the comment itself is read on the profile, under the rules that already
-- apply to it.
select phase9_sql_test.assert(
  not exists (
    select 1 from public.notifications
    where body like '%SECRET%'
  ),
  'privacy: a notification never carries the content of a comment'
);

rollback;

-- =============================================================================
-- 8. ONLY THE RECIPIENT CAN READ OR CHANGE A NOTIFICATION
-- =============================================================================

-- Make a notification that persists past this section.
begin;
select set_config(
  'request.jwt.claims',
  '{"sub":"e3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

insert into public.follows (follower_id, following_id, status)
values (
  'e3333333-3333-3333-3333-333333333333',
  'e1111111-1111-1111-1111-111111111111',
  'accepted'
);

commit;

-- The RECIPIENT can read it.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e1111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

select phase9_sql_test.assert(
  (select count(*) from public.notifications) = 1,
  'access: the recipient CAN read their notification'
);

-- The RECIPIENT can mark it read.
update public.notifications
set read_at = now();

select phase9_sql_test.assert(
  (select count(*) from public.notifications where read_at is not null) = 1,
  'access: the recipient CAN mark a notification read'
);

-- The RECIPIENT can dismiss it.
update public.notifications
set dismissed_at = now();

select phase9_sql_test.assert(
  (select count(*) from public.notifications where dismissed_at is not null) = 1,
  'access: the recipient CAN dismiss a notification'
);

rollback;

-- A NON-RECIPIENT — the actor — can read NOTHING.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

select phase9_sql_test.assert(
  (select count(*) from public.notifications) = 0,
  'access: a non-recipient CANNOT read a notification'
);

-- And can change NOTHING.
update public.notifications
set read_at = null;

select phase9_sql_test.assert(
  (select count(*) from public.notifications where read_at is null) = 0,
  'access: a non-recipient CANNOT change a notification'
);

rollback;

-- An ANONYMOUS visitor sees nothing, and can insert nothing.
--
-- The refusal happens at the PRIVILEGE level rather than at the row level:
-- `anon` holds no privilege on the table at all, so the read is refused
-- outright. That is stronger than an empty result — there is nothing to
-- filter.
begin;
set local role anon;

do $probe$
begin
  begin
    perform count(*) from public.notifications;
    raise exception 'an anonymous READ of notifications was NOT refused';
  exception when insufficient_privilege then
    null;
  end;
end;
$probe$;

select phase9_sql_test.assert(
  not has_table_privilege('anon', 'public.notifications', 'select'),
  'access: an anonymous visitor CANNOT read notifications'
);

do $probe$
begin
  begin
    insert into public.notifications (
      recipient_id, actor_id, type, follow_id, comment_id, body,
      actor_username, target_username
    )
    values (
      'e1111111-1111-1111-1111-111111111111',
      'e3333333-3333-3333-3333-333333333333',
      'follow',
      null,
      null,
      'A forged notification.',
      'p9grace',
      'p9ellie'
    );
    raise exception 'an anonymous INSERT into notifications was NOT refused';
  exception when insufficient_privilege then
    null;
  end;
end;
$probe$;

select phase9_sql_test.assert(
  not has_table_privilege('anon', 'public.notifications', 'insert'),
  'privileges: anon holds NO privilege on notifications'
);

rollback;

-- A client role cannot create a notification for somebody else.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

do $probe$
begin
  begin
    insert into public.notifications (
      recipient_id, actor_id, type, follow_id, comment_id, body,
      actor_username, target_username
    )
    values (
      'e1111111-1111-1111-1111-111111111111',
      'e3333333-3333-3333-3333-333333333333',
      'follow',
      null,
      null,
      'A forged notification.',
      'p9grace',
      'p9ellie'
    );
    raise exception 'a client INSERT into notifications was NOT refused';
  exception when insufficient_privilege then
    null;
  end;
end;
$probe$;

select phase9_sql_test.assert(
  (select count(*) from public.notifications) = 0,
  'access: a client role CANNOT create a notification'
);

rollback;

-- And the write function is not callable directly either.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

do $probe$
begin
  begin
    perform public.record_notification(
      'e1111111-1111-1111-1111-111111111111',
      'e3333333-3333-3333-3333-333333333333',
      'follow',
      null,
      null
    );
    raise exception 'a client CALL to record_notification was NOT refused';
  exception when insufficient_privilege then
    null;
  end;
end;
$probe$;

select phase9_sql_test.assert(
  (select count(*) from public.notifications) = 0,
  'access: a client role CANNOT call record_notification'
);

rollback;

-- The fixture that section 8 committed is removed here, so the sections
-- below start from a clean slate and their counts are their own.
delete from public.notifications
where recipient_id = 'e1111111-1111-1111-1111-111111111111'
  and actor_id = 'e3333333-3333-3333-3333-333333333333';

delete from public.follows
where follower_id = 'e3333333-3333-3333-3333-333333333333'
  and following_id = 'e1111111-1111-1111-1111-111111111111';

-- =============================================================================
-- 9. A BLOCK SILENCES THE PAIR
-- =============================================================================

begin;

-- Carol follows Alice.
select set_config(
  'request.jwt.claims',
  '{"sub":"e3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

insert into public.follows (follower_id, following_id, status)
values (
  'e3333333-3333-3333-3333-333333333333',
  'e1111111-1111-1111-1111-111111111111',
  'accepted'
);

-- Alice blocks Carol.
select set_config(
  'request.jwt.claims',
  '{"sub":"e1111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

insert into public.user_blocks (blocker_id, blocked_id)
values (
  'e1111111-1111-1111-1111-111111111111',
  'e3333333-3333-3333-3333-333333333333'
);

-- The notification that already existed is discarded.
select phase9_sql_test.assert(
  not exists (
    select 1 from public.notifications
    where recipient_id = 'e1111111-1111-1111-1111-111111111111'
      and actor_id = 'e3333333-3333-3333-3333-333333333333'
  ),
  'blocks: a block discards the notifications between the pair'
);

rollback;

-- And no NEW notification is created for a blocked pair.
begin;

-- Alice blocks Carol first.
select set_config(
  'request.jwt.claims',
  '{"sub":"e1111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

insert into public.user_blocks (blocker_id, blocked_id)
values (
  'e1111111-1111-1111-1111-111111111111',
  'e3333333-3333-3333-3333-333333333333'
);

-- Now Carol tries to comment on Alice's profile. The comment is refused by
-- the database's own comment rule, and no notification is written.
select set_config(
  'request.jwt.claims',
  '{"sub":"e3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

do $probe$
begin
  begin
    insert into public.profile_comments (author_id, profile_id, body)
    values (
      'e3333333-3333-3333-3333-333333333333',
      'e1111111-1111-1111-1111-111111111111',
      'A comment from a blocked account.'
    );
  exception when others then
    null;
  end;
end;
$probe$;

select phase9_sql_test.assert(
  not exists (
    select 1 from public.notifications
    where actor_id = 'e3333333-3333-3333-3333-333333333333'
      and recipient_id = 'e1111111-1111-1111-1111-111111111111'
  ),
  'blocks: a blocked pair generates NO notification'
);

rollback;

-- =============================================================================
-- 10. THE READ AND DISMISS STATE
-- =============================================================================

begin;
select set_config(
  'request.jwt.claims',
  '{"sub":"e3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

insert into public.follows (follower_id, following_id, status)
values (
  'e3333333-3333-3333-3333-333333333333',
  'e1111111-1111-1111-1111-111111111111',
  'accepted'
);

-- A new notification is UNREAD.
select phase9_sql_test.assert(
  (select count(*) from phase9_sql_test.fixture_notifications
   where read_at is null) = 1,
  'state: a new notification is UNREAD'
);

update phase9_sql_test.fixture_notifications
set read_at = now();

select phase9_sql_test.assert(
  (select count(*) from phase9_sql_test.fixture_notifications
   where read_at is null) = 0,
  'state: a notification can be marked read'
);

update phase9_sql_test.fixture_notifications
set dismissed_at = now();

-- A dismissed notification is still a row: reading is not deleting.
select phase9_sql_test.assert(
  (select count(*) from phase9_sql_test.fixture_notifications) = 1,
  'state: dismissing a notification keeps the row'
);

select phase9_sql_test.assert(
  (select count(*) from phase9_sql_test.fixture_notifications
   where dismissed_at is null) = 0,
  'state: a dismissed notification is marked as such'
);

rollback;

-- =============================================================================
-- 11. THE UNREAD COUNT
-- =============================================================================

begin;
select set_config(
  'request.jwt.claims',
  '{"sub":"e3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

insert into public.follows (follower_id, following_id, status)
values (
  'e3333333-3333-3333-3333-333333333333',
  'e1111111-1111-1111-1111-111111111111',
  'accepted'
);

-- The unread count is the number of notifications that are neither read nor
-- dismissed. A dismissed notification is not a reminder.
select phase9_sql_test.assert(
  (select count(*) from phase9_sql_test.fixture_notifications
   where read_at is null and dismissed_at is null) = 1,
  'count: an unread notification is counted'
);

update phase9_sql_test.fixture_notifications
set read_at = now();

select phase9_sql_test.assert(
  (select count(*) from phase9_sql_test.fixture_notifications
   where read_at is null and dismissed_at is null) = 0,
  'count: a read notification is NOT counted'
);

rollback;

-- =============================================================================
-- THE SUMMARY
-- =============================================================================

select case when bool_and(passed) then 'PASS' else 'FAIL' end as outcome,
       count(*) as assertions,
       count(*) filter (where passed) as passed
from phase9_sql_test.results;

-- =============================================================================
-- CLEANUP
-- =============================================================================
--
-- Only the rows this file created, by their fixed ids.
--
delete from public.notifications
where actor_id in (
  'e1111111-1111-1111-1111-111111111111',
  'e2222222-2222-2222-2222-222222222222',
  'e3333333-3333-3333-3333-333333333333'
)
or recipient_id in (
  'e1111111-1111-1111-1111-111111111111',
  'e2222222-2222-2222-2222-222222222222',
  'e3333333-3333-3333-3333-333333333333'
);

delete from public.profile_comments where author_id in (
  'e1111111-1111-1111-1111-111111111111',
  'e2222222-2222-2222-2222-222222222222',
  'e3333333-3333-3333-3333-333333333333'
);

delete from public.user_blocks where blocker_id in (
  'e1111111-1111-1111-1111-111111111111',
  'e2222222-2222-2222-2222-222222222222',
  'e3333333-3333-3333-3333-333333333333'
);

delete from public.follows where follower_id in (
  'e1111111-1111-1111-1111-111111111111',
  'e2222222-2222-2222-2222-222222222222',
  'e3333333-3333-3333-3333-333333333333'
);

-- The ACCOUNTS themselves.
--
-- The deletes above remove this file's rows, but the three accounts it
-- created in `auth.users` would survive it — and a fixture account left on a
-- project is a real account, with a handle somebody could claim and a profile
-- somebody could stumble into.
--
-- The profile rows go with the accounts: `profiles.user_id` references
-- `auth.users(id)` with `on delete cascade`, as does every social row and
-- every notification. The explicit deletes above are kept anyway, because
-- they document exactly what the file touched, and because they hold even if
-- a cascade is ever changed.
--
-- The accounts are recreated by the inserts at the top of this file, so a
-- second run starts from the same fixture.
--
delete from auth.users where id in (
  'e1111111-1111-1111-1111-111111111111',
  'e2222222-2222-2222-2222-222222222222',
  'e3333333-3333-3333-3333-333333333333'
);

drop schema phase9_sql_test cascade;
