-- =============================================================================
-- PRSME — Pre-Phase 11 policy-level SQL tests (My List)
-- =============================================================================
--
-- WHAT THIS IS
--
-- The rules behind the personal list, exercised from INSIDE the database,
-- where the RLS context can be set exactly: as the `anon` role, as
-- `authenticated` with a given user's claims, and as a second unrelated user.
--
-- The list's rules live in RLS policies and constraints, and those are only
-- observable from SQL — the REST layer cannot see a policy's decision, only
-- its effect.
--
-- HOW TO RUN IT
--
--   - In the Supabase SQL editor (dashboard), paste and run. It reports a
--     PASS/FAIL line per assertion.
--   - Locally, against the Phase 6.1 stack:
--       node scripts/localdb/prephase11-sql-tests.mjs
--   - Against the REMOTE project:
--       node scripts/prephase11-remote-sql-tests.mjs
--
-- IT IS SELF-CONTAINED AND LEAVES NOTHING BEHIND
--
-- Every object it creates lives under the `prephase11_sql_test` schema, which
-- is dropped and recreated at the start and dropped again at the end. The
-- fixture rows it writes are removed by their own fixed ids before it starts
-- and again at the end.
--
-- THE RULES THIS FILE PROVES
--
--   1. the table exists, with the right shape;
--   2. one entry per (account, media item) — the duplicate rule;
--   3. an entry points at a REAL catalogue record, and is deleted with it;
--   4. an account can read, add and remove ONLY its own entries;
--   5. an account CANNOT write an entry on somebody else's behalf;
--   6. an anonymous visitor has no access at all;
--   7. there is no UPDATE path — an entry is added or removed, never edited;
--   8. the client role holds no privilege beyond SELECT / INSERT / DELETE.
--
-- HOW THE ACTING USER IS SET
--
-- Every block sets the JWT claims, because the policies read `auth.uid()`.
-- The blocks stay in the `postgres` role, which bypasses RLS, so a test can
-- read every row rather than only the ones a real account would see. The
-- sections that test a POLICY itself switch to the `authenticated` role,
-- deliberately.
--
-- WHY THERE IS NO `do … $$` BLOCK
--
-- A dollar-quoted body is invisible to a diff, and a collapsed `$$` is fatal
-- to the statement splitter — the body would be read as ordinary SQL and cut
-- at the first semicolon inside it. So the "this statement must be refused"
-- checks call a helper function instead, and the file contains dollar quotes
-- only where they are written on one line.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Assertions
-- -----------------------------------------------------------------------------

create schema if not exists prephase11_sql_test;

-- The results table comes FIRST: the helper functions below write into it,
-- and Postgres resolves a function body's table references when the function
-- is created, so the table has to exist by then.
create table if not exists prephase11_sql_test.results (
  id serial primary key,
  label text not null,
  passed boolean not null,
  detail text,
  ran_at timestamptz not null default now()
);

create or replace function prephase11_sql_test.record_result(
  label text,
  passed boolean,
  detail text default null
)
returns void
language plpgsql
as $$
begin
  insert into prephase11_sql_test.results (label, passed, detail)
  values (label, passed, detail);

  -- The notice is what makes the verdict survive the enclosing transaction.
  --
  -- The assertions that switch role and read through RLS run inside
  -- `begin; … rollback;` blocks, so the row they write is rolled back with
  -- the fixture rows. A NOTICE is a message rather than a row, so it
  -- survives.
  raise notice 'PRSME_SQL_TEST|%|%', case when passed then 'true' else 'false' end, label;
end;
$$;

create or replace function prephase11_sql_test.assert(
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
  perform prephase11_sql_test.record_result(label, true, null);
end;
$$;

-- Run a statement and report whether the DATABASE refused it.
--
-- The statement runs as the CALLING role — the function is SECURITY INVOKER
-- (the default), so `current_user` is still whatever `set local role` chose.
-- That is what makes the check meaningful: the refusal comes from the RLS
-- policy under the caller's own identity, not from a privilege the helper
-- happens to hold.
--
-- The exception is caught inside a PL/pgSQL block, which is a subtransaction —
-- so the enclosing transaction survives, and the assertions that follow can
-- still run.
create or replace function prephase11_sql_test.refused(
  statement text
)
returns boolean
language plpgsql
as $p11$
begin
  begin
    execute statement;
  exception when insufficient_privilege then
    return true;
  end;
  return false;
end;
$p11$;

-- The same idea, for the DUPLICATE rule.
--
-- A second save of the same work is refused by the UNIQUE constraint, which
-- is a different refusal from a privilege refusal, so it is checked with its
-- own helper rather than folded into the one above.
create or replace function prephase11_sql_test.duplicate_refused(
  statement text
)
returns boolean
language plpgsql
as $p11$
begin
  begin
    execute statement;
  exception when unique_violation then
    return true;
  end;
  return false;
end;
$p11$;

-- The assertion helpers live in this schema, and the blocks below switch to
-- the `anon` and `authenticated` roles to read through RLS. A role cannot call
-- a function in a schema it has no USAGE on, so the privileges are granted
-- here. They are scoped to this throwaway test schema only.
grant usage on schema prephase11_sql_test to anon, authenticated;
grant insert on prephase11_sql_test.results to anon, authenticated;
grant usage, select on all sequences in schema prephase11_sql_test to anon, authenticated;
grant execute on function prephase11_sql_test.record_result(text, boolean, text) to anon, authenticated;
grant execute on function prephase11_sql_test.assert(boolean, text) to anon, authenticated;
grant execute on function prephase11_sql_test.refused(text) to anon, authenticated;

-- Start from a clean slate.
truncate prephase11_sql_test.results;

-- -----------------------------------------------------------------------------
-- The fixtures
-- -----------------------------------------------------------------------------
--
-- Two accounts, and two catalogue records.
--
--   lior     the account that owns a list
--   sable    an unrelated account, the one that must not see it
--
-- The media records are real rows in `public.media_items`, because a list
-- entry REFERENCES the canonical catalogue. A list entry that could point at
-- a media id that does not exist would render as an empty card.
--
insert into auth.users (id, email)
values
  ('b2000000-0000-4000-8000-000000000001', 'prephase11lior@example.test'),
  ('b2000000-0000-4000-8000-000000000002', 'prephase11sable@example.test')
on conflict (id) do nothing;

insert into public.profiles (user_id, username, visibility, profile_state)
values
  ('b2000000-0000-4000-8000-000000000001', 'prephase11lior', 'public', '{"version":1,"displayName":"Lior"}'::jsonb),
  ('b2000000-0000-4000-8000-000000000002', 'prephase11sable', 'public', '{"version":1,"displayName":"Sable"}'::jsonb)
on conflict (user_id) do nothing;

insert into public.media_items (id, provider, provider_id, kind, title, release_year)
values
  ('b2000000-0000-4000-8000-0000000000a1', 'cinemeta', 'prephase11-film-1', 'movie', 'Pre-Phase 11 Film', 2021),
  ('b2000000-0000-4000-8000-0000000000a2', 'itunes', 'prephase11-album-1', 'album', 'Pre-Phase 11 Album', 2019)
on conflict (id) do nothing;

-- Clear the fixture's rows, so the file can be run twice.
delete from public.user_list_items where user_id in (
  'b2000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002'
);

-- =============================================================================
-- 1. THE SCHEMA
-- =============================================================================

select prephase11_sql_test.assert(
  to_regclass('public.user_list_items') is not null,
  'schema: the user_list_items table exists'
);

select prephase11_sql_test.assert(
  (select relrowsecurity from pg_class where oid = 'public.user_list_items'::regclass),
  'schema: RLS is enabled on the list table'
);

-- The four columns the brief names, and nothing invented.
select prephase11_sql_test.assert(
  (select count(*) from information_schema.columns
   where table_schema = 'public'
     and table_name = 'user_list_items'
     and column_name in ('id', 'user_id', 'media_id', 'created_at')) = 4,
  'schema: the list has id, user_id, media_id and created_at'
);

-- The owner is a real account.
select prephase11_sql_test.assert(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.user_list_items'::regclass
      and contype = 'f'
      and confrelid = 'auth.users'::regclass
  ),
  'schema: the owner is a foreign key to the authenticated account'
);

-- The item is a real catalogue record.
select prephase11_sql_test.assert(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.user_list_items'::regclass
      and contype = 'f'
      and confrelid = 'public.media_items'::regclass
  ),
  'schema: the item is a foreign key to the canonical media catalogue'
);

-- =============================================================================
-- 2. THE DUPLICATE RULE
-- =============================================================================

-- One entry per (account, media item).
select prephase11_sql_test.assert(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.user_list_items'::regclass
      and contype = 'u'
      and lower(pg_get_constraintdef(oid)) like '%user_id%'
      and lower(pg_get_constraintdef(oid)) like '%media_id%'
  ),
  'constraints: there is a UNIQUE constraint on (user_id, media_id)'
);

-- Saving the same work twice is refused by the database, not merely by the
-- application.
begin;
insert into public.user_list_items (user_id, media_id)
values (
  'b2000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-0000000000a1'
);

select prephase11_sql_test.assert(
  prephase11_sql_test.duplicate_refused(
    'insert into public.user_list_items (user_id, media_id) values (''b2000000-0000-4000-8000-000000000001'', ''b2000000-0000-4000-8000-0000000000a1'')'
  ),
  'constraints: the same work cannot be saved twice'
);

select prephase11_sql_test.assert(
  (select count(*) from public.user_list_items
   where user_id = 'b2000000-0000-4000-8000-000000000001'
     and media_id = 'b2000000-0000-4000-8000-0000000000a1') = 1,
  'constraints: a refused duplicate leaves the original entry alone'
);

rollback;

-- =============================================================================
-- 3. THE PRIVILEGES
-- =============================================================================

-- `anon` gets nothing at all. An unauthenticated visitor has no list.
select prephase11_sql_test.assert(
  not exists (
    select 1
    from information_schema.role_table_grants
    where grantee = 'anon'
      and table_schema = 'public'
      and table_name = 'user_list_items'
  ),
  'privileges: anon holds NO privilege on the list table'
);

-- The client role gets SELECT, INSERT and DELETE — and NOT UPDATE.
--
-- There is no update policy (the next section proves it), so an UPDATE
-- privilege would be a privilege without a purpose.
select prephase11_sql_test.assert(
  exists (
    select 1
    from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'public'
      and table_name = 'user_list_items'
      and privilege_type = 'SELECT'
  )
  and exists (
    select 1
    from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'public'
      and table_name = 'user_list_items'
      and privilege_type = 'INSERT'
  )
  and exists (
    select 1
    from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'public'
      and table_name = 'user_list_items'
      and privilege_type = 'DELETE'
  )
  and not exists (
    select 1
    from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'public'
      and table_name = 'user_list_items'
      and privilege_type in ('UPDATE', 'TRUNCATE')
  ),
  'privileges: the client role may select, insert and delete — never update'
);

-- =============================================================================
-- 4. THE POLICIES
-- =============================================================================

-- Exactly three policies: read your own, add to your own, remove from your
-- own. No update policy, because an entry is added or removed, never edited.
select prephase11_sql_test.assert(
  (select count(*) from pg_policies
   where schemaname = 'public' and tablename = 'user_list_items') = 3
  and not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_list_items'
      and cmd = 'UPDATE'
  ),
  'policies: there are three policies and none of them is an UPDATE'
);

-- Every policy compares the row's own `user_id` against `auth.uid()`.
--
-- That comparison IS the rule. A policy that compared anything else — a
-- request parameter, a session variable the client could set — would not be
-- a privacy rule at all.
select prephase11_sql_test.assert(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_list_items'
      and (coalesce(qual, '') || ' ' || coalesce(with_check, ''))
        not like '%auth.uid()%'
  ),
  'policies: every policy compares user_id against auth.uid()'
);

-- =============================================================================
-- 5. THE OWNER'S LIST
-- =============================================================================

-- The owner adds an entry.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b2000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

insert into public.user_list_items (user_id, media_id)
values (
  'b2000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-0000000000a1'
);

select prephase11_sql_test.assert(
  (select count(*) from public.user_list_items) = 1,
  'owner: an account can add an entry to its own list'
);

rollback;

-- =============================================================================
-- 6. NOBODY ELSE'S LIST
-- =============================================================================

-- An account CANNOT write an entry on somebody else's behalf.
--
-- This is the write path's guarantee. `user_id` is a column, and a client
-- can put any value it likes in an INSERT body — so the `with check` clause
-- is what refuses a crafted write.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select prephase11_sql_test.assert(
  prephase11_sql_test.refused(
    'insert into public.user_list_items (user_id, media_id) values (''b2000000-0000-4000-8000-000000000001'', ''b2000000-0000-4000-8000-0000000000a1'')'
  ),
  'privacy: an account cannot add an entry to somebody else''s list'
);

-- The refused write left nothing behind.
--
-- The row is read by the account it WOULD have belonged to, because that is
-- the only account whose SELECT policy would show it. Read through the
-- account that was refused instead, the count would be zero whether the write
-- landed or not — so the assertion would prove nothing at all.
select set_config(
  'request.jwt.claims',
  '{"sub":"b2000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select prephase11_sql_test.assert(
  not exists (
    select 1 from public.user_list_items
    where user_id = 'b2000000-0000-4000-8000-000000000001'
  ),
  'privacy: the refused write left nothing behind'
);

rollback;

-- ONE TRANSACTION, TWO ACCOUNTS.
--
-- The owner's entry has to EXIST while the other account reads, or the
-- assertion would be describing an empty table rather than a filtered one.
-- So both acts happen inside a single transaction: the owner writes, the
-- claims are swapped, and the other account reads the same rows.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b2000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

insert into public.user_list_items (user_id, media_id)
values (
  'b2000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-0000000000a1'
);

select prephase11_sql_test.assert(
  (select count(*) from public.user_list_items) = 1,
  'owner: the owner sees its own entry'
);

-- Now the OTHER account reads the very same table.
select set_config(
  'request.jwt.claims',
  '{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select prephase11_sql_test.assert(
  (select count(*) from public.user_list_items) = 0,
  'privacy: another account sees nothing of the owner''s list'
);

-- And it cannot remove the owner's entry either.
--
-- The DELETE is *filtered*, not refused: RLS's `using` clause means the row is
-- simply not in the set the statement can touch, so the statement succeeds
-- and removes nothing.
--
-- THE DELETE HAS NO WHERE CLAUSE, AND THAT IS THE POINT.
--
-- A delete that filters on a column is gated TWICE. Reading `user_id` off a
-- row is a read, and reads are subject to the SELECT policy — so a row the
-- account cannot SEE is never scanned, and the delete touches nothing even
-- when the DELETE policy is wide open. Such a delete cannot tell a working
-- policy from a broken one, and an assertion built on it proves nothing.
--
-- A blanket delete reads no column, so the DELETE policy alone decides it.
-- This is therefore the one statement in the file that actually exercises
-- the delete rule.
--
-- `returning` is what makes the outcome visible. A follow-up SELECT would
-- run under the OTHER account, whose SELECT policy hides the owner's rows —
-- so it would answer zero whether the delete did nothing, or the delete
-- worked and the reader simply cannot see the wreckage. `returning` reports
-- what the statement actually touched, and nothing else.
with removed as (
  delete from public.user_list_items
  returning 1
)
select prephase11_sql_test.assert(
  (select count(*) from removed) = 0,
  'privacy: an account cannot remove somebody else''s entry'
);

-- The entry is still there, read by the only account allowed to read it.
select set_config(
  'request.jwt.claims',
  '{"sub":"b2000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select prephase11_sql_test.assert(
  (select count(*) from public.user_list_items
   where user_id = 'b2000000-0000-4000-8000-000000000001') = 1,
  'privacy: the owner''s entry survived the other account''s delete'
);

-- And the owner CAN remove its own entry — so the rule above is a privacy
-- rule, and not a blanket refusal of every DELETE.
--
-- The blanket form is kept for the same reason: it is the DELETE policy
-- alone that decides it, so this assertion too can fail when the policy is
-- broken. A WHERE-clause delete would be stopped by the SELECT policy as
-- well, and would pass even if the DELETE policy refused everything.
with removed as (
  delete from public.user_list_items
  returning 1
)
select prephase11_sql_test.assert(
  (select count(*) from removed) = 1,
  'owner: an account can remove its own entry'
);

rollback;

-- =============================================================================
-- 7. NO ANONYMOUS ACCESS
-- =============================================================================

-- An anonymous visitor has no list, and cannot create one.
begin;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select prephase11_sql_test.assert(
  prephase11_sql_test.refused('select count(*) from public.user_list_items'),
  'privacy: an anonymous visitor cannot read the list table'
);

select prephase11_sql_test.assert(
  prephase11_sql_test.refused(
    'insert into public.user_list_items (user_id, media_id) values (''b2000000-0000-4000-8000-000000000001'', ''b2000000-0000-4000-8000-0000000000a1'')'
  ),
  'privacy: an anonymous visitor cannot create a list entry'
);

rollback;

-- =============================================================================
-- 8. THE CASCADE
-- =============================================================================

-- An entry whose catalogue record is gone cannot survive it.
--
-- The entry would render as an empty card — no title, no artwork, and no kind
-- to categorise it by — so the row goes with the record.
select prephase11_sql_test.assert(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.user_list_items'::regclass
      and contype = 'f'
      and confrelid = 'public.media_items'::regclass
      and confdeltype = 'c'
  ),
  'schema: deleting a catalogue record removes the entries that pointed at it'
);

-- And the owner's account taking its list with it.
select prephase11_sql_test.assert(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.user_list_items'::regclass
      and contype = 'f'
      and confrelid = 'auth.users'::regclass
      and confdeltype = 'c'
  ),
  'schema: deleting an account removes its list'
);

-- =============================================================================
-- 9. THE CLEANUP
-- =============================================================================

delete from public.user_list_items where user_id in (
  'b2000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002'
);

delete from public.media_items where id in (
  'b2000000-0000-4000-8000-0000000000a1',
  'b2000000-0000-4000-8000-0000000000a2'
);

delete from public.profiles where user_id in (
  'b2000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002'
);

delete from auth.users where id in (
  'b2000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002'
);

-- The summary.
--
-- It is read BEFORE the schema is dropped, because the results live IN the
-- schema that is about to go. The Phase 8 file reads its summary the same
-- way, and for the same reason.
select label, passed, detail from prephase11_sql_test.results order by id;

drop schema if exists prephase11_sql_test cascade;
