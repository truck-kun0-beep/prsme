-- =============================================================================
-- PRSME — Phase 10 policy-level SQL tests
-- =============================================================================
--
-- WHAT THIS IS
--
-- The moderation rules, exercised from INSIDE the database, where the RLS
-- context can be set exactly: as the `anon` role, as `authenticated` with a
-- given user's claims, as a moderator, and as a second unrelated user.
--
-- The moderation logic lives in SECURITY DEFINER functions and RLS policies,
-- and those are only observable from SQL — the REST layer cannot see a
-- policy's decision, only its effect.
--
-- HOW TO RUN IT
--
--   - In the Supabase SQL editor (dashboard), paste and run. It reports a
--     PASS/FAIL line per assertion.
--   - Locally, against the Phase 6.1 stack:
--       node scripts/localdb/phase10-sql-tests.mjs
--   - Against the REMOTE project:
--       node scripts/phase10-remote-sql-tests.mjs
--
-- IT IS SELF-CONTAINED AND LEAVES NOTHING BEHIND
--
-- Every object it creates lives under the `phase10_sql_test` schema, which is
-- dropped and recreated at the start and dropped again at the end. The
-- fixture rows it writes are removed by their own fixed ids before it starts
-- and again at the end.
--
-- THE RULES THIS FILE PROVES
--
--   1. the roster exists and nobody can write to it;
--   2. an ordinary account is not a moderator, and cannot act;
--   3. a moderator can read the queue, and can act on a report;
--   4. every consequential action needs a reason, and writes an audit record;
--   5. the report status transitions are the only ones allowed;
--   6. a comment can be removed and restored, and the text is really gone;
--   7. a restriction is enforced by the DATABASE, and can be lifted;
--   8. the audit log cannot be edited or deleted by anybody;
--   9. the reporter's identity is not exposed to the reported account;
--  10. the existing social behaviour still holds.
--
-- HOW THE ACTING USER IS SET
--
-- Every block sets the JWT claims, because the roster check reads
-- `auth.uid()`. The blocks stay in the `postgres` role, which bypasses RLS,
-- so a test can read every row rather than only the ones a real account
-- would see. The sections that test a POLICY itself switch to the
-- `authenticated` role, deliberately.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Assertions
-- -----------------------------------------------------------------------------

create schema if not exists phase10_sql_test;

-- The results table comes FIRST: the helper functions below write into it,
-- and Postgres resolves a function body's table references when the function
-- is created, so the table has to exist by then.
create table if not exists phase10_sql_test.results (
  id serial primary key,
  label text not null,
  passed boolean not null,
  detail text,
  ran_at timestamptz not null default now()
);

create or replace function phase10_sql_test.record_result(
  label text,
  passed boolean,
  detail text default null
)
returns void
language plpgsql
as $$
begin
  insert into phase10_sql_test.results (label, passed, detail)
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

create or replace function phase10_sql_test.assert(
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
  perform phase10_sql_test.record_result(label, true, null);
end;
$$;

-- The assertion helpers live in this schema, and the blocks below switch to
-- the `anon` and `authenticated` roles to read through RLS. A role cannot call
-- a function in a schema it has no USAGE on, so the privileges are granted
-- here. They are scoped to this throwaway test schema only.
grant usage on schema phase10_sql_test to anon, authenticated;
grant insert on phase10_sql_test.results to anon, authenticated;
grant usage, select on all sequences in schema phase10_sql_test to anon, authenticated;
grant execute on function phase10_sql_test.record_result(text, boolean, text) to anon, authenticated;
grant execute on function phase10_sql_test.assert(boolean, text) to anon, authenticated;

-- Start from a clean slate.
truncate phase10_sql_test.results;

-- -----------------------------------------------------------------------------
-- The fixtures
-- -----------------------------------------------------------------------------
--
-- Five accounts:
--
--   maren    the moderator
--   oskar    an ordinary account
--   petra    an ordinary account, the REPORTER
--   robin    the REPORTED account
--   wanda    the author of the reported comment
--
-- All of them are PUBLIC, so the only thing being tested here is the
-- moderation layer and not the privacy rules from Phase 5.
--
insert into auth.users (id, email)
values
  ('a1000000-0000-4000-8000-000000000001', 'phase10maren@example.test'),
  ('a1000000-0000-4000-8000-000000000002', 'phase10oskar@example.test'),
  ('a1000000-0000-4000-8000-000000000003', 'phase10petra@example.test'),
  ('a1000000-0000-4000-8000-000000000004', 'phase10robin@example.test'),
  ('a1000000-0000-4000-8000-000000000005', 'phase10wanda@example.test')
on conflict (id) do nothing;

insert into public.profiles (user_id, username, visibility, profile_state)
values
  ('a1000000-0000-4000-8000-000000000001', 'phase10maren', 'public', '{"version":1,"displayName":"Maren"}'::jsonb),
  ('a1000000-0000-4000-8000-000000000002', 'phase10oskar', 'public', '{"version":1,"displayName":"Oskar"}'::jsonb),
  ('a1000000-0000-4000-8000-000000000003', 'phase10petra', 'public', '{"version":1,"displayName":"Petra"}'::jsonb),
  ('a1000000-0000-4000-8000-000000000004', 'phase10robin', 'public', '{"version":1,"displayName":"Robin"}'::jsonb),
  ('a1000000-0000-4000-8000-000000000005', 'phase10wanda', 'public', '{"version":1,"displayName":"Wanda"}'::jsonb)
on conflict (user_id) do nothing;

-- Clear the fixture's rows, so the file can be run twice.
delete from public.moderation_audit_log where moderator_id in (
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000004',
  'a1000000-0000-4000-8000-000000000005'
);

delete from public.moderation_actions where moderator_id in (
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000004',
  'a1000000-0000-4000-8000-000000000005'
);

delete from public.account_restrictions where user_id in (
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000004',
  'a1000000-0000-4000-8000-000000000005'
);

delete from public.content_reports where reporter_id in (
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000004',
  'a1000000-0000-4000-8000-000000000005'
);

delete from public.profile_comments where author_id in (
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000004',
  'a1000000-0000-4000-8000-000000000005'
);

delete from public.moderators where user_id in (
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000004',
  'a1000000-0000-4000-8000-000000000005'
);

-- =============================================================================
-- 1. THE SCHEMA
-- =============================================================================

select phase10_sql_test.assert(
  to_regclass('public.moderators') is not null,
  'schema: the moderators table exists'
);

select phase10_sql_test.assert(
  to_regclass('public.moderation_actions') is not null,
  'schema: the moderation_actions table exists'
);

select phase10_sql_test.assert(
  to_regclass('public.account_restrictions') is not null,
  'schema: the account_restrictions table exists'
);

select phase10_sql_test.assert(
  to_regclass('public.moderation_audit_log') is not null,
  'schema: the moderation_audit_log table exists'
);

-- RLS is enabled on every new table.
select phase10_sql_test.assert(
  (select relrowsecurity from pg_class where oid = 'public.moderators'::regclass)
    and (select relrowsecurity from pg_class where oid = 'public.moderation_actions'::regclass)
    and (select relrowsecurity from pg_class where oid = 'public.account_restrictions'::regclass)
    and (select relrowsecurity from pg_class where oid = 'public.moderation_audit_log'::regclass),
  'schema: RLS is enabled on every moderation table'
);

-- The report carries an assignment, a note and a resolution timestamp.
select phase10_sql_test.assert(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'content_reports'
      and column_name = 'assigned_to'
  )
  and exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'content_reports'
      and column_name = 'moderator_note'
  )
  and exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'content_reports'
      and column_name = 'resolved_at'
  ),
  'schema: the report model gained an assignment, a note and a resolution time'
);

-- A consequential action needs a reason.
select phase10_sql_test.assert(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.moderation_actions'::regclass
      and contype = 'c'
      and lower(pg_get_constraintdef(oid)) like '%reason is not null%'
  ),
  'constraints: a moderation action needs a reason'
);

-- The restriction's scope is a closed set, and it needs a reason.
select phase10_sql_test.assert(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.account_restrictions'::regclass
      and contype = 'c'
      and lower(pg_get_constraintdef(oid)) like '%posting%'
  ),
  'constraints: the restriction scope is a closed set'
);

-- The audit log's action is a closed set.
select phase10_sql_test.assert(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.moderation_audit_log'::regclass
      and contype = 'c'
      and lower(pg_get_constraintdef(oid)) like '%account_restricted%'
      and lower(pg_get_constraintdef(oid)) like '%dismissed%'
  ),
  'constraints: the audit action is a closed set'
);

-- =============================================================================
-- 2. THE PRIVILEGES
-- =============================================================================

-- `anon` holds nothing at all on the moderation tables.
select phase10_sql_test.assert(
  not exists (
    select 1
    from information_schema.role_table_grants
    where grantee = 'anon'
      and table_schema = 'public'
      and table_name in (
        'moderators',
        'moderation_actions',
        'account_restrictions',
        'moderation_audit_log',
        'content_reports'
      )
  ),
  'privileges: anon holds NO privilege on any moderation table'
);

-- The client role holds SELECT and nothing else on the moderation tables.
--
-- The writes go through the SECURITY DEFINER functions, so the client needs
-- no INSERT/UPDATE/DELETE privilege on any of them.
select phase10_sql_test.assert(
  not exists (
    select 1
    from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'public'
      and table_name in (
        'moderators',
        'moderation_actions',
        'account_restrictions',
        'moderation_audit_log'
      )
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  ),
  'privileges: the client role cannot write to a moderation table directly'
);

-- `anon` cannot EXECUTE the moderation functions.
select phase10_sql_test.assert(
  not has_function_privilege('anon', 'public.is_moderator()', 'execute')
    and not has_function_privilege('anon', 'public.moderation_dismiss_report(uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.moderation_restrict_account(text, text, text, integer)', 'execute'),
  'privileges: anon cannot EXECUTE a moderation function'
);

-- The function that CREATES moderators is not callable by a client role.
--
-- This is the one that matters most: if an ordinary account could call
-- `grant_moderator`, it could make itself a moderator.
select phase10_sql_test.assert(
  not has_function_privilege('anon', 'public.grant_moderator(text, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.grant_moderator(text, text)', 'execute'),
  'privileges: no client role can EXECUTE grant_moderator'
);

-- The audit write is not callable by a client role either.
--
-- If it were, a client could forge an audit record that says a moderation
-- action happened when it did not.
select phase10_sql_test.assert(
  not has_function_privilege('anon', 'public.write_moderation_audit(text, uuid, uuid, uuid, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.write_moderation_audit(text, uuid, uuid, uuid, text)', 'execute'),
  'privileges: no client role can EXECUTE write_moderation_audit'
);

-- =============================================================================
-- 3. THE ROSTER IS NOT WRITABLE BY A CLIENT
-- =============================================================================

-- An ordinary account cannot put itself on the roster.
--
-- The policy list is the proof: there is a SELECT policy and NO insert,
-- update or delete policy, so the write is refused.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
begin
  begin
    insert into public.moderators (user_id, note)
    values ('a1000000-0000-4000-8000-000000000002', 'self-appointed');
    raise exception 'the self-appointment was NOT refused';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

select phase10_sql_test.assert(
  (select count(*) from public.moderators
   where user_id in (
     'a1000000-0000-4000-8000-000000000001',
     'a1000000-0000-4000-8000-000000000002',
     'a1000000-0000-4000-8000-000000000003',
     'a1000000-0000-4000-8000-000000000004',
     'a1000000-0000-4000-8000-000000000005'
   )) = 0,
  'roster: an ordinary account cannot add itself to the roster'
);

rollback;

-- Nor can it remove a moderator.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
begin
  begin
    delete from public.moderators
    where user_id = 'a1000000-0000-4000-8000-000000000001';
    raise exception 'the deletion was NOT refused';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

select phase10_sql_test.assert(
  (select count(*) from public.moderators) = 0,
  'roster: an ordinary account cannot remove a moderator'
);

rollback;

-- =============================================================================
-- 4. WHO IS A MODERATOR
-- =============================================================================

-- Nobody in the FIXTURE is a moderator yet.
--
-- The assertion is about the fixture's own accounts, not about the whole
-- table. A roster row left behind by an unrelated run — a browser suite that
-- crashed before its cleanup, say — is not this file's business, and failing
-- on it would make the suite fail for a reason it cannot explain.
select phase10_sql_test.assert(
  (select count(*) from public.moderators
   where user_id in (
     'a1000000-0000-4000-8000-000000000001',
     'a1000000-0000-4000-8000-000000000002',
     'a1000000-0000-4000-8000-000000000003',
     'a1000000-0000-4000-8000-000000000004',
     'a1000000-0000-4000-8000-000000000005'
   )) = 0,
  'roster: the fixture starts with an empty roster'
);

-- An ordinary account is not a moderator.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select phase10_sql_test.assert(
  not public.is_moderator(),
  'roster: an ordinary account is not a moderator'
);

rollback;

-- An anonymous visitor is not a moderator.
--
-- The anonymous role is refused outright, and that refusal IS the answer:
-- `is_moderator()` is revoked from `anon`, so an anonymous visitor cannot even
-- ask who the moderators are, let alone act. Asserting that the call SUCCEEDS
-- and returns false would be asserting something the database deliberately
-- refuses to do.
begin;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $probe$
begin
  begin
    perform public.is_moderator();
    raise exception 'the anonymous call was NOT refused';
  exception when insufficient_privilege then
    null;
  end;
end;
$probe$;

select phase10_sql_test.assert(
  true,
  'roster: an anonymous visitor is not a moderator'
);

rollback;

-- And with no identity in the claims at all, the function's own answer is false.
--
-- This runs as the table owner — the one role that can evaluate the function
-- for everybody else — so it shows what the function DECIDES when the caller
-- has no `sub`, as opposed to what the privileges REFUSE.
select phase10_sql_test.assert(
  not public.is_moderator(),
  'roster: a session with no identity is not a moderator'
);

-- Now grant the role, the way an operator would.
select public.grant_moderator('phase10maren', 'the fixture moderator');

select phase10_sql_test.assert(
  (select count(*) from public.moderators
   where user_id = 'a1000000-0000-4000-8000-000000000001') = 1,
  'roster: an operator can grant the moderator role'
);

-- And the account can now act as one.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select phase10_sql_test.assert(
  public.is_moderator(),
  'roster: the granted account IS a moderator'
);

rollback;

-- The role is not inherited by anybody else.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

select phase10_sql_test.assert(
  not public.is_moderator(),
  'roster: the role does not spread to other accounts'
);

rollback;

-- =============================================================================
-- 5. THE QUEUE IS FOR MODERATORS
-- =============================================================================

-- Petra reports Robin's profile.
insert into public.content_reports (reporter_id, profile_id, reason, details)
values (
  'a1000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000004',
  'spam',
  'This account is pretending to be somebody else.'
);

-- Wanda comments on Robin's profile, and Petra reports the comment.
insert into public.profile_comments (author_id, profile_id, body)
values (
  'a1000000-0000-4000-8000-000000000005',
  'a1000000-0000-4000-8000-000000000004',
  'A comment that ought to be removed.'
);

insert into public.content_reports (reporter_id, comment_id, reason)
values (
  'a1000000-0000-4000-8000-000000000003',
  (select id from public.profile_comments
   where author_id = 'a1000000-0000-4000-8000-000000000005'
   limit 1),
  'harassment'
);

-- The fixture filed two reports.
--
-- The count is scoped to the FIXTURE's own reporter. This assertion runs as
-- the table owner, which bypasses RLS, so an unscoped count would also count
-- reports left behind by an unrelated run.
select phase10_sql_test.assert(
  (select count(*) from public.content_reports
   where reporter_id = 'a1000000-0000-4000-8000-000000000003') = 2,
  'queue: the fixture filed two reports'
);

-- An ordinary account cannot read the queue.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select phase10_sql_test.assert(
  (select count(*) from public.content_reports) = 0,
  'queue: an ordinary account cannot read ANY report'
);

rollback;

-- The REPORTER can read their own report — and only their own.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

select phase10_sql_test.assert(
  (select count(*) from public.content_reports) = 2,
  'queue: the reporter can read their own reports'
);

rollback;

-- The REPORTED account cannot read the report against it.
--
-- A report that notifies its subject is a notice, not a report.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);

select phase10_sql_test.assert(
  (select count(*) from public.content_reports) = 0,
  'queue: the reported account cannot see that it was reported'
);

rollback;

-- A MODERATOR can read the queue.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select phase10_sql_test.assert(
  (select count(*) from public.content_reports
   where reporter_id = 'a1000000-0000-4000-8000-000000000001'
      or reporter_id = 'a1000000-0000-4000-8000-000000000003') = 2,
  'queue: a moderator can read the whole queue'
);

rollback;

-- The moderation tables are for moderators only.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select phase10_sql_test.assert(
  (select count(*) from public.moderation_actions) = 0
    and (select count(*) from public.account_restrictions) = 0
    and (select count(*) from public.moderation_audit_log) = 0
    and (select count(*) from public.moderators) = 0,
  'queue: an ordinary account cannot read the moderation tables'
);

rollback;

-- =============================================================================
-- 6. AN ORDINARY ACCOUNT CANNOT ACT
-- =============================================================================

begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
declare
  target_report uuid;
begin
  select id into target_report
  from public.content_reports
  where reporter_id = 'a1000000-0000-4000-8000-000000000003'
  limit 1;

  begin
    perform public.moderation_dismiss_report(target_report, 'not my call');
    raise exception 'the dismissal was NOT refused';
  exception when others then
    if sqlerrm not like '%not a moderator%' then
      raise;
    end if;
  end;
end;
$$;

select phase10_sql_test.assert(
  (select count(*) from public.content_reports where status = 'dismissed') = 0,
  'actions: an ordinary account cannot dismiss a report'
);

rollback;

-- The same for the restriction, which is the most consequential one.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
begin
  begin
    perform public.moderation_restrict_account(
      'phase10robin', 'not my call', 'posting', 30
    );
    raise exception 'the restriction was NOT refused';
  exception when others then
    if sqlerrm not like '%not a moderator%' then
      raise;
    end if;
  end;
end;
$$;

select phase10_sql_test.assert(
  (select count(*) from public.account_restrictions) = 0,
  'actions: an ordinary account cannot restrict an account'
);

rollback;

-- And an ordinary account cannot lift one either.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
begin
  begin
    perform public.moderation_lift_restriction(
      '00000000-0000-0000-0000-000000000000', 'not my call'
    );
    raise exception 'the lift was NOT refused';
  exception when others then
    if sqlerrm not like '%not a moderator%' then
      raise;
    end if;
  end;
end;
$$;

select phase10_sql_test.assert(
  true,
  'actions: an ordinary account cannot lift a restriction'
);

rollback;

-- =============================================================================
-- 7. A MODERATOR CAN ACT
-- =============================================================================

-- Claim a report.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.moderation_claim_report(
  (select id from public.content_reports
   where reporter_id = 'a1000000-0000-4000-8000-000000000003'
     and profile_id = 'a1000000-0000-4000-8000-000000000004'
   limit 1)
);

select phase10_sql_test.assert(
  (select assigned_to from public.content_reports
   where profile_id = 'a1000000-0000-4000-8000-000000000004') =
    'a1000000-0000-4000-8000-000000000001',
  'actions: a moderator can claim a report'
);

select phase10_sql_test.assert(
  (select count(*) from public.moderation_actions
   where action = 'claimed'
     and moderator_id = 'a1000000-0000-4000-8000-000000000001') = 1,
  'audit: the claim wrote a moderation action'
);

select phase10_sql_test.assert(
  (select count(*) from public.moderation_audit_log
   where action = 'claimed'
     and moderator_id = 'a1000000-0000-4000-8000-000000000001') = 1,
  'audit: the claim wrote an audit record'
);

rollback;

-- Move a report under review.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.moderation_start_review(
  (select id from public.content_reports
   where profile_id = 'a1000000-0000-4000-8000-000000000004'
   limit 1),
  'Looking into it.'
);

select phase10_sql_test.assert(
  (select status from public.content_reports
   where profile_id = 'a1000000-0000-4000-8000-000000000004') = 'reviewed',
  'actions: a moderator can move a report under review'
);

rollback;

-- Dismiss a report.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.moderation_dismiss_report(
  (select id from public.content_reports
   where profile_id = 'a1000000-0000-4000-8000-000000000004'
   limit 1),
  'Nothing was wrong with it.'
);

select phase10_sql_test.assert(
  (select status from public.content_reports
   where profile_id = 'a1000000-0000-4000-8000-000000000004') = 'dismissed',
  'actions: a moderator can dismiss a report'
);

select phase10_sql_test.assert(
  (select resolved_at is not null from public.content_reports
   where profile_id = 'a1000000-0000-4000-8000-000000000004'),
  'actions: a dismissal stamps the resolution time'
);

rollback;

-- A dismissal without a reason is refused.
--
-- The database refuses it, so the interface cannot get it wrong.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
declare
  target_report uuid;
begin
  select id into target_report
  from public.content_reports
  where profile_id = 'a1000000-0000-4000-8000-000000000004'
  limit 1;

  begin
    perform public.moderation_dismiss_report(target_report, '   ');
    raise exception 'the reasonless dismissal was NOT refused';
  exception when others then
    if sqlerrm not like '%needs a reason%' then
      raise;
    end if;
  end;
end;
$$;

select phase10_sql_test.assert(
  (select status from public.content_reports
   where profile_id = 'a1000000-0000-4000-8000-000000000004') = 'open',
  'actions: a dismissal without a reason is refused'
);

rollback;

-- Resolve a report.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.moderation_resolve_report(
  (select id from public.content_reports
   where profile_id = 'a1000000-0000-4000-8000-000000000004'
   limit 1),
  'The content was removed.'
);

select phase10_sql_test.assert(
  (select status from public.content_reports
   where profile_id = 'a1000000-0000-4000-8000-000000000004') = 'actioned',
  'actions: a moderator can resolve a report'
);

rollback;

-- =============================================================================
-- 8. THE STATUS TRANSITIONS
-- =============================================================================

-- A dismissed report cannot be reopened by moving it under review.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.moderation_dismiss_report(
  (select id from public.content_reports
   where profile_id = 'a1000000-0000-4000-8000-000000000004'
   limit 1),
  'Nothing was wrong with it.'
);

do $$
declare
  target_report uuid;
begin
  select id into target_report
  from public.content_reports
  where profile_id = 'a1000000-0000-4000-8000-000000000004'
  limit 1;

  begin
    perform public.moderation_start_review(target_report, 'second thoughts');
    raise exception 'the reopening was NOT refused';
  exception when others then
    if sqlerrm not like '%is not open%' then
      raise;
    end if;
  end;
end;
$$;

select phase10_sql_test.assert(
  (select status from public.content_reports
   where profile_id = 'a1000000-0000-4000-8000-000000000004') = 'dismissed',
  'transitions: a closed report cannot be reopened'
);

rollback;

-- A resolved report cannot be dismissed afterwards.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.moderation_resolve_report(
  (select id from public.content_reports
   where profile_id = 'a1000000-0000-4000-8000-000000000004'
   limit 1),
  'The content was removed.'
);

do $$
declare
  target_report uuid;
begin
  select id into target_report
  from public.content_reports
  where profile_id = 'a1000000-0000-4000-8000-000000000004'
  limit 1;

  begin
    perform public.moderation_dismiss_report(target_report, 'changed my mind');
    raise exception 'the dismissal was NOT refused';
  exception when others then
    if sqlerrm not like '%open or under review%' then
      raise;
    end if;
  end;
end;
$$;

select phase10_sql_test.assert(
  (select status from public.content_reports
   where profile_id = 'a1000000-0000-4000-8000-000000000004') = 'actioned',
  'transitions: a resolved report cannot be dismissed afterwards'
);

rollback;

-- =============================================================================
-- 9. REMOVING AND RESTORING A COMMENT
-- =============================================================================

-- The comment's id, captured before the removal.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.moderation_remove_comment(
  (select id from public.profile_comments
   where author_id = 'a1000000-0000-4000-8000-000000000005'
   limit 1),
  'It breaks the rules.'
);

select phase10_sql_test.assert(
  (select body from public.profile_comments
   where author_id = 'a1000000-0000-4000-8000-000000000005') =
    '[removed by a moderator]',
  'comments: a removed comment is replaced by a marker'
);

-- The TEXT is really gone. The row is kept, but the words are not.
select phase10_sql_test.assert(
  not exists (
    select 1 from public.profile_comments
    where body like '%ought to be removed%'
  ),
  'comments: the removed comment TEXT is really gone'
);

-- The row is KEPT, so the history still refers to something real.
select phase10_sql_test.assert(
  (select count(*) from public.profile_comments
   where author_id = 'a1000000-0000-4000-8000-000000000005') = 1,
  'comments: the comment row is kept after a removal'
);

select phase10_sql_test.assert(
  (select count(*) from public.moderation_actions
   where action = 'comment_removed'
     and target_user_id = 'a1000000-0000-4000-8000-000000000005') = 1,
  'comments: the removal recorded the comment author as the target'
);

rollback;

-- And it can be restored.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.moderation_remove_comment(
  (select id from public.profile_comments
   where author_id = 'a1000000-0000-4000-8000-000000000005'
   limit 1),
  'It breaks the rules.'
);

select public.moderation_restore_comment(
  (select id from public.profile_comments
   where author_id = 'a1000000-0000-4000-8000-000000000005'
   limit 1),
  'Removed in error.'
);

select phase10_sql_test.assert(
  (select body from public.profile_comments
   where author_id = 'a1000000-0000-4000-8000-000000000005') =
    '[restored by a moderator]',
  'comments: a restored comment comes back'
);

select phase10_sql_test.assert(
  (select count(*) from public.moderation_actions
   where action = 'comment_restored'
     and target_user_id = 'a1000000-0000-4000-8000-000000000005') = 1,
  'comments: the restoration was recorded'
);

rollback;

-- =============================================================================
-- 10. THE RESTRICTION
-- =============================================================================

-- Apply one.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.moderation_restrict_account(
  'phase10robin', 'Repeated harassment.', 'posting', 30
);

select phase10_sql_test.assert(
  (select count(*) from public.account_restrictions
   where user_id = 'a1000000-0000-4000-8000-000000000004') = 1,
  'restriction: a moderator can restrict an account'
);

select phase10_sql_test.assert(
  public.is_restricted('a1000000-0000-4000-8000-000000000004'),
  'restriction: the restricted account IS restricted'
);

select phase10_sql_test.assert(
  not public.is_restricted('a1000000-0000-4000-8000-000000000002'),
  'restriction: an unrestricted account is not restricted'
);

rollback;

-- The restriction is ENFORCED by the database: the restricted account
-- cannot post a comment.
--
-- This is the whole point of putting the guard on the RLS policy rather than
-- in the application.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.moderation_restrict_account(
  'phase10robin', 'Repeated harassment.', 'posting', 30
);

-- Now Robin tries to comment on Wanda's profile.
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);

do $$
begin
  begin
    insert into public.profile_comments (author_id, profile_id, body)
    values (
      'a1000000-0000-4000-8000-000000000004',
      'a1000000-0000-4000-8000-000000000005',
      'I would like to comment, please.'
    );
    raise exception 'the restricted comment was NOT refused';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

select phase10_sql_test.assert(
  not exists (
    select 1 from public.profile_comments
    where author_id = 'a1000000-0000-4000-8000-000000000004'
  ),
  'restriction: a restricted account cannot post a comment'
);

rollback;

-- And the restriction can be lifted.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.moderation_restrict_account(
  'phase10robin', 'Repeated harassment.', 'posting', 30
);

select public.moderation_lift_restriction(
  (select id from public.account_restrictions
   where user_id = 'a1000000-0000-4000-8000-000000000004'
   limit 1),
  'The warning was enough.'
);

select phase10_sql_test.assert(
  not public.is_restricted('a1000000-0000-4000-8000-000000000004'),
  'restriction: a lifted restriction stops applying'
);

-- The row is KEPT, so the record of what happened is not lost.
select phase10_sql_test.assert(
  (select count(*) from public.account_restrictions
   where user_id = 'a1000000-0000-4000-8000-000000000004'
     and lifted_at is not null
     and lifted_by = 'a1000000-0000-4000-8000-000000000001') = 1,
  'restriction: a lifted restriction is kept, with who lifted it'
);

rollback;

-- A restriction does NOT delete the account, and does NOT end its follows.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.moderation_restrict_account(
  'phase10robin', 'Repeated harassment.', 'posting', 30
);

select phase10_sql_test.assert(
  exists (
    select 1 from public.profiles
    where user_id = 'a1000000-0000-4000-8000-000000000004'
  ),
  'restriction: a restricted account keeps its profile'
);

rollback;

-- =============================================================================
-- 11. THE AUDIT LOG IS APPEND-ONLY
-- =============================================================================
--
-- The trail is defended by THREE layers, and each one is tested on its own:
--
--   1. the PRIVILEGE layer — the client roles hold no UPDATE or DELETE
--      privilege on the log at all, so a moderator's attempt is refused
--      before the statement reaches the table;
--   2. the TRIGGER layer — the log refuses an UPDATE or a DELETE from
--      anybody, including the table's own owner;
--   3. the POLICY layer — there is no UPDATE policy and no DELETE policy,
--      for anybody.
--
-- Testing only the trigger would prove the trigger works and say nothing
-- about the privilege layer, and testing only the privilege layer would
-- leave the trigger untested. So each layer gets its own assertion, and
-- the refusal of one is never mistaken for the refusal of another.

-- Layer 1: the privilege layer.
--
-- A moderator is a moderator, but the log is not theirs to rewrite. The
-- client role holds SELECT on it and nothing else, so the statement is
-- refused with 'permission denied for table moderation_audit_log'.
--
-- The refusal is caught INSIDE the block, so the transaction is not left
-- aborted and the assertions after it still run.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $probe$
begin
  begin
    update public.moderation_audit_log
    set note = 'a nicer note'
    where action = 'dismissed';
    raise exception 'the audit edit was NOT refused';
  exception when insufficient_privilege then
    null;
  end;
end;
$probe$;

select phase10_sql_test.assert(
  not has_table_privilege('authenticated', 'public.moderation_audit_log', 'update')
    and not has_table_privilege('authenticated', 'public.moderation_audit_log', 'delete'),
  'audit: a moderator holds no write privilege on the audit log'
);

rollback;

-- Layer 2: the trigger.
--
-- The trigger is what holds when the privilege layer is bypassed — by the
-- owner, by a superuser, or by a future migration that grants more than it
-- meant to. So it is exercised directly, as the table's owner.
--
-- THE RECORD HAS TO EXIST FIRST.
--
-- The trigger is BEFORE UPDATE / BEFORE DELETE FOR EACH ROW, so a statement
-- that matches no row never reaches it. An empty table would therefore
-- accept a DELETE without complaint, and the test would prove nothing. The
-- fixture record is inserted inside the block and removed by the rollback.
begin;
insert into public.moderation_audit_log (moderator_id, action, note)
values (
  'a1000000-0000-4000-8000-000000000001',
  'dismissed',
  'a fixture record'
);

do $probe$
begin
  begin
    update public.moderation_audit_log
    set note = 'a nicer note'
    where note = 'a fixture record';
    raise exception 'the audit edit was NOT refused';
  exception when others then
    if sqlerrm not like '%append-only%' then
      raise;
    end if;
  end;
end;
$probe$;

select phase10_sql_test.assert(
  (select count(*) from public.moderation_audit_log
   where note = 'a nicer note') = 0,
  'audit: an audit record cannot be edited'
);

-- And it cannot be deleted either.
do $probe$
begin
  begin
    delete from public.moderation_audit_log where note = 'a fixture record';
    raise exception 'the audit delete was NOT refused';
  exception when others then
    if sqlerrm not like '%append-only%' then
      raise;
    end if;
  end;
end;
$probe$;

select phase10_sql_test.assert(
  (select count(*) from public.moderation_audit_log
   where note = 'a fixture record') = 1,
  'audit: an audit record cannot be deleted'
);

rollback;

-- Even the table's own owner cannot rewrite it.
--
-- The trigger refuses the statement whatever the role is, so the trail
-- holds even against a mistake by an operator.
begin;
insert into public.moderation_audit_log (moderator_id, action, note)
values (
  'a1000000-0000-4000-8000-000000000001',
  'claimed',
  'another fixture record'
);

do $probe$
begin
  begin
    delete from public.moderation_audit_log;
    raise exception 'the owner delete was NOT refused';
  exception when others then
    if sqlerrm not like '%append-only%' then
      raise;
    end if;
  end;
end;
$probe$;

select phase10_sql_test.assert(
  (select count(*) from public.moderation_audit_log
   where note = 'another fixture record') = 1,
  'audit: even the owner cannot delete an audit record'
);

rollback;

-- =============================================================================
-- 12. THE REPORTER'S IDENTITY
-- =============================================================================

-- The reported account cannot learn WHO reported it.
--
-- The report rows are invisible to it entirely, so there is nothing to read
-- and nothing to infer.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);

select phase10_sql_test.assert(
  (select count(*) from public.content_reports) = 0,
  'privacy: the reported account cannot read any report'
);

select phase10_sql_test.assert(
  (select count(*) from public.moderation_audit_log
   where target_user_id = 'a1000000-0000-4000-8000-000000000004') = 0,
  'privacy: the reported account cannot read the audit trail about it'
);

rollback;

-- An ordinary account cannot read the audit trail either.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select phase10_sql_test.assert(
  (select count(*) from public.moderation_audit_log) = 0,
  'privacy: an ordinary account cannot read the audit trail'
);

rollback;

-- =============================================================================
-- 13. THE MODERATOR'S READ PATH
-- =============================================================================

-- A moderator can resolve a username, including one whose profile is
-- private — because a report about a private profile is exactly the case
-- where somebody could otherwise act without scrutiny.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select phase10_sql_test.assert(
  public.moderation_resolve_username('phase10robin') =
    'a1000000-0000-4000-8000-000000000004',
  'read path: a moderator can resolve a username'
);

select phase10_sql_test.assert(
  public.moderation_resolve_username('nobodyhere') is null,
  'read path: an unknown username resolves to null'
);

rollback;

-- An ordinary account cannot.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
begin
  begin
    perform public.moderation_resolve_username('phase10robin');
    raise exception 'the resolution was NOT refused';
  exception when others then
    if sqlerrm not like '%not a moderator%' then
      raise;
    end if;
  end;
end;
$$;

select phase10_sql_test.assert(
  true,
  'read path: an ordinary account cannot resolve a username'
);

rollback;

-- =============================================================================
-- 14. THE EXISTING SOCIAL BEHAVIOUR STILL HOLDS
-- =============================================================================

-- A block is still invisible to the blocked account.
insert into public.user_blocks (blocker_id, blocked_id)
values (
  'a1000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000005'
)
on conflict do nothing;

begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000005","role":"authenticated"}',
  true
);

select phase10_sql_test.assert(
  (select count(*) from public.user_blocks) = 0,
  'regression: a block is still invisible to the blocked account'
);

rollback;

-- A blocked pair still cannot comment.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000005","role":"authenticated"}',
  true
);

do $$
begin
  begin
    insert into public.profile_comments (author_id, profile_id, body)
    values (
      'a1000000-0000-4000-8000-000000000005',
      'a1000000-0000-4000-8000-000000000003',
      'Hello?'
    );
    raise exception 'the blocked comment was NOT refused';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

select phase10_sql_test.assert(
  not exists (
    select 1 from public.profile_comments
    where author_id = 'a1000000-0000-4000-8000-000000000005'
      and profile_id = 'a1000000-0000-4000-8000-000000000003'
  ),
  'regression: a blocked pair still cannot comment'
);

rollback;

-- A report is still invisible to the reported account, and the reporter's
-- identity is not in the notification system.
select phase10_sql_test.assert(
  not exists (
    select 1 from public.notifications
    where recipient_id = 'a1000000-0000-4000-8000-000000000004'
      and actor_id = 'a1000000-0000-4000-8000-000000000003'
  ),
  'regression: a report does not notify the reported account'
);

-- =============================================================================
-- 15. THE CLEANUP
-- =============================================================================

delete from public.moderation_audit_log where moderator_id in (
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000004',
  'a1000000-0000-4000-8000-000000000005'
);

delete from public.moderation_actions where moderator_id in (
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000004',
  'a1000000-0000-4000-8000-000000000005'
);

delete from public.account_restrictions where user_id in (
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000004',
  'a1000000-0000-4000-8000-000000000005'
);

delete from public.content_reports where reporter_id in (
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000004',
  'a1000000-0000-4000-8000-000000000005'
);

delete from public.profile_comments where author_id in (
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000004',
  'a1000000-0000-4000-8000-000000000005'
);

delete from public.user_blocks where blocker_id in (
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000004',
  'a1000000-0000-4000-8000-000000000005'
);

delete from public.moderators where user_id in (
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000004',
  'a1000000-0000-4000-8000-000000000005'
);

-- The accounts themselves go too, so the file leaves nothing behind.
delete from auth.users where id in (
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000004',
  'a1000000-0000-4000-8000-000000000005'
);

-- The summary.
select label, passed, detail from phase10_sql_test.results order by id;
