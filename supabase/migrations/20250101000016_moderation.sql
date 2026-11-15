-- =============================================================================
-- PRSME — Phase 10: moderation
-- =============================================================================
--
-- WHAT THIS IS
--
-- The structures and rules that make a report actionable by a human: a
-- moderator roster, a moderation action log, an account restriction, and an
-- immutable audit trail.
--
-- Phase 8 stored reports and stopped there. Phase 10 gives them a queue.
--
-- THE ONE THING THIS FILE IS CAREFUL ABOUT
--
-- A moderation system is a security system, and its failure mode is not a
-- crash — it is a stranger being handed the keys. Every rule below is written
-- so that the ANSWER to "is this caller a moderator?" comes from the DATABASE,
-- and never from something the caller sent.
--
-- THE MODERATOR ROSTER IS A TABLE, NOT A COLUMN
--
-- `profiles.profile_state` is a JSON document the account owner controls. A
-- moderator flag stored there would be a flag the owner could set on
-- themselves. `auth.users.raw_app_meta_data` is server-managed, but it is
-- written by whatever holds the service-role key — so a role stashed there
-- would be one the application grants, and a leak of that key would grant
-- moderation to everybody.
--
-- So the roster is its own table, with no INSERT path for any client role.
-- A row appears in it only because a human ran a script against the database.
-- There is no "sign up as a moderator", no self-service form, and no code
-- path in this repository that inserts one.
--
-- WHY THE ROSTER IS NOT A JWT CLAIM
--
-- A claim would have to be issued by the auth service, and the auth service is
-- driven by the same key. The roster is deliberately one step further away:
-- reading it is a database lookup, so revoking moderation is a DELETE from a
-- table, and it takes effect on the next request rather than at the next
-- token refresh.
--
-- WHY `is_moderator()` IS SECURITY DEFINER
--
-- The roster is readable by moderators only, so a policy that asked "is this
-- caller in the roster?" directly would need the roster to be readable by
-- everybody. `is_moderator()` reads it with the definer's rights and returns a
-- BOOLEAN, and the boolean is the only thing that leaves the function.
--
-- WHY THE ACTIONS RUN AS THE CALLER, NOT AS THE SERVICE ROLE
--
-- The moderation functions below are SECURITY DEFINER, and they are called
-- with the MODERATOR'S OWN session — the same session every other part of the
-- application uses.
--
-- That is deliberate. `auth.uid()` reads the `sub` claim out of the verified
-- JWT, and it does so regardless of who the current database role is. So a
-- moderator's own JWT is what identifies them inside the function, and a
-- caller cannot substitute somebody else's identity: the only way to reach
-- `auth.uid()` is to present a token that Supabase signed.
--
-- It also means the application needs NO service-role key at all for
-- moderation. The service role bypasses RLS, and a bypass is exactly what a
-- moderation system should not have in its ordinary path.
--
-- WHAT A MODERATOR IS NOT
--
--   - Not a client role. `moderator` is not a Postgres role here; it is a row.
--   - Not a claim. Nothing in the JWT says "moderator".
--   - Not a hidden UI element. The interface may HIDE the moderation link from
--     a non-moderator, but the link is not the boundary — every API route and
--     every database operation below checks the roster independently.
--
-- THE RESTRICTION, AND WHAT IT IS FOR
--
-- A restriction is a documented, reversible limit on an account: it cannot
-- post a comment on another account's profile. It is NOT a suspension and NOT
-- a ban. It does not hide the account, does not delete it, and does not end
-- the relationship with the people who follow it.
--
-- The distinction matters. A report is an ALLEGATION. An allegation is not a
-- finding, and nothing in this file treats one as a finding: removing a
-- comment or applying a restriction is an explicit, separately-confirmed
-- decision by a human, recorded in the audit log with their identity and
-- their reason.
--
-- NOTHING IS DELETED
--
-- There is no function here that deletes an account, and no policy that
-- permits a client to delete one. A restricted account keeps its profile, its
-- followers and its content; the restriction is a flag with an expiry.
--
-- Apply with:  supabase db push        (CLI, linked project)
--           or: paste into the Supabase SQL editor
--
-- This migration is additive and safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. THE ROSTER
-- -----------------------------------------------------------------------------
--
-- One row per moderator. The primary key is the account id, so an account can
-- be a moderator at most once.
--
-- `granted_by` records WHO granted the role. It is nullable because the first
-- moderator may be granted by an operator with no account on the system.
--
-- `note` is the operator's free-text reason for the grant. It is an internal
-- record: it is never shown to the account, and only a moderator can read it.
--
create table if not exists public.moderators (
  user_id     uuid primary key
                references auth.users (id) on delete cascade,

  -- Who granted the role. NULL means an operator granted it directly.
  granted_by  uuid
                references auth.users (id) on delete set null,

  -- The operator's note, e.g. "community lead, appointed 2026-01-01".
  note        text,

  granted_at  timestamptz not null default now()
);

-- Listing the roster, for the dashboard's "who is a moderator" panel.
create index if not exists moderators_granted_at_idx
  on public.moderators (granted_at desc);

-- -----------------------------------------------------------------------------
-- 2. IS THIS CALLER A MODERATOR?
-- -----------------------------------------------------------------------------
--
-- The single definition of moderator authorization. Every policy and every
-- function below asks this and nothing else.
--
-- It answers about the CALLER, so it takes no argument: a function that took
-- an account id would be a function that could be asked about somebody else,
-- and a caller that could ask "is account X a moderator?" could use the answer
-- to map the roster.
--
create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.moderators m
      where m.user_id = (select auth.uid())
    ),
    false
  );
$$;

-- -----------------------------------------------------------------------------
-- 3. THE REPORT COLUMNS
-- -----------------------------------------------------------------------------
--
-- `content_reports.status` already exists, with the values Phase 8 defined:
-- 'open', 'reviewed', 'actioned', 'dismissed'.
--
-- The brief asks for four states the dashboard must show: pending, under
-- review, resolved, dismissed. The existing four map onto them exactly, and
-- this file does NOT introduce a second status vocabulary:
--
--   'open'      -> pending
--   'reviewed'  -> under review
--   'actioned'  -> resolved (something was done about it)
--   'dismissed' -> dismissed (nothing was wrong)
--
-- So the column is reused, and the dashboard's labels are a presentation
-- concern. Reusing it is the point of the brief's "extend the existing
-- content_reports model only where required".
--
-- The column needs no new CHECK constraint: Phase 8 already constrains it,
-- and this file does not modify that migration.
--
-- What IS added is the assignment column, the internal note, and the
-- resolution timestamp.
--
alter table public.content_reports
  add column if not exists assigned_to uuid
    references auth.users (id) on delete set null;

alter table public.content_reports
  add column if not exists moderator_note text;

alter table public.content_reports
  add column if not exists resolved_at timestamptz;

-- The dashboard's "under review" tab, and the assignment filter.
create index if not exists content_reports_assigned_idx
  on public.content_reports (assigned_to, created_at desc)
  where assigned_to is not null;

-- The queue: the open and under-review reports, oldest first.
--
-- Partial on the two live states, so the index holds only what the queue
-- actually shows.
create index if not exists content_reports_queue_idx
  on public.content_reports (created_at)
  where status in ('open', 'reviewed');

-- -----------------------------------------------------------------------------
-- 4. THE MODERATION ACTIONS
-- -----------------------------------------------------------------------------
--
-- The history of what was done about a report.
--
-- This is a record of ACTION, not a copy of the report. It says what a
-- moderator did, to what, and why — and it is append-only.
--
create table if not exists public.moderation_actions (
  id            uuid primary key default gen_random_uuid(),

  -- The report this action belongs to.
  --
  -- ON DELETE CASCADE: a report that is withdrawn takes its actions with it.
  -- The audit log below is the durable record and does NOT cascade — that
  -- difference is deliberate.
  report_id     uuid not null
                  references public.content_reports (id) on delete cascade,

  -- The moderator who performed the action.
  moderator_id  uuid not null
                  references auth.users (id) on delete cascade,

  -- What was done.
  --
  -- The closed set is enforced by a CHECK rather than by convention, so a
  -- typo cannot become an action the interface does not know how to render.
  action        text not null
                  check (action in (
                    'claimed',
                    'under_review',
                    'dismissed',
                    'resolved',
                    'comment_removed',
                    'account_restricted',
                    'restriction_lifted',
                    'comment_restored'
                  )),

  -- The account the action was taken AGAINST, when there was one.
  --
  -- A comment removal names the comment's AUTHOR; a restriction names the
  -- restricted account. A dismissal names nobody: nothing was done to
  -- anybody.
  target_user_id uuid
                  references auth.users (id) on delete set null,

  -- The content the action was taken against, when there was content.
  target_comment_id uuid
                  references public.profile_comments (id) on delete set null,

  -- The moderator's reason. Required for every consequential action, and
  -- optional for the ones that are bookkeeping.
  reason        text,

  -- The report's status AFTER the action, so the history reads on its own.
  status_after  text,

  created_at    timestamptz not null default now(),

  -- A consequential action without a reason is not a decision, it is a
  -- reflex. The bookkeeping actions — claiming a report, moving it under
  -- review — are exempt.
  check (
    action in ('claimed', 'under_review')
    or (reason is not null and char_length(btrim(reason)) between 1 and 2000)
  )
);

-- The history of one report, newest first.
create index if not exists moderation_actions_report_idx
  on public.moderation_actions (report_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 5. THE ACCOUNT RESTRICTION
-- -----------------------------------------------------------------------------
--
-- A documented, reversible limit on an account.
--
-- WHAT IT DOES
--
-- The restricted account cannot post a comment on another account's profile.
-- That is the whole of it.
--
-- WHAT IT DOES NOT DO
--
-- It does not hide the account, does not suspend it, does not delete it, and
-- does not end its follows. A restriction is a limit on behaviour, not a
-- verdict on the person.
--
-- `expires_at` is the point of the limit. A restriction with no expiry is a
-- permanent one, and that has to be a deliberate choice — so the column
-- allows NULL and the server writes NULL only when a moderator says so.
--
create table if not exists public.account_restrictions (
  id            uuid primary key default gen_random_uuid(),

  -- The restricted account.
  user_id       uuid not null
                  references auth.users (id) on delete cascade,

  -- The report that led here, when there was one.
  --
  -- ON DELETE SET NULL: a withdrawn report does not erase the fact that the
  -- account was restricted. The restriction stands on its own.
  report_id     uuid
                  references public.content_reports (id) on delete set null,

  -- What kind of limit this is.
  --
  -- 'posting'  cannot post a comment on another account's profile
  --
  -- The single scope is deliberate. A narrower vocabulary means a limit can
  -- be lifted in full without ambiguity, and the audit trail does not have to
  -- carry a partial state that nothing can act on.
  scope         text not null
                  check (scope in ('posting')),

  -- The moderator's reason. Required.
  reason        text not null
                  check (char_length(btrim(reason)) between 1 and 2000),

  -- Who applied it.
  applied_by    uuid not null
                  references auth.users (id) on delete cascade,

  -- When it was applied.
  applied_at    timestamptz not null default now(),

  -- When it lapses. NULL means it does not lapse on its own.
  expires_at    timestamptz,

  -- When it was lifted. NULL means it is still in force.
  --
  -- The row is KEPT after it is lifted, so the record of what happened to
  -- the account is not lost.
  lifted_at     timestamptz,

  -- Who lifted it.
  lifted_by     uuid
                  references auth.users (id) on delete set null,

  -- A restriction is either in force or lifted, never both.
  check (lifted_at is null or lifted_by is not null)
);

-- "What restrictions does this account have?" — the only query the
-- enforcement functions and the policies make.
create index if not exists account_restrictions_user_idx
  on public.account_restrictions (user_id, applied_at desc)
  where lifted_at is null;

-- The live restrictions, for the dashboard's view.
create index if not exists account_restrictions_live_idx
  on public.account_restrictions (applied_at desc)
  where lifted_at is null;

-- -----------------------------------------------------------------------------
-- 6. THE AUDIT LOG
-- -----------------------------------------------------------------------------
--
-- The durable record of what moderators did.
--
-- WHY IT IS A SEPARATE TABLE
--
-- `moderation_actions` belongs to a report and is deleted with it. The audit
-- log does NOT belong to a report: it belongs to the SYSTEM, and it outlives
-- the report it was written about. If a report is withdrawn, the fact that a
-- moderator acted on it — and what they did — remains.
--
-- WHY IT IS APPEND-ONLY
--
-- An audit trail that its own subject can edit is not an audit trail. So:
--
--   - there is NO UPDATE policy and NO DELETE policy, for anybody;
--   - the client roles hold no INSERT privilege either — the writes come from
--     the SECURITY DEFINER functions below, which run as the table's owner;
--   - a trigger refuses an UPDATE or a DELETE outright, so even the table's
--     owner cannot rewrite history by accident.
--
create table if not exists public.moderation_audit_log (
  id            uuid primary key default gen_random_uuid(),

  -- Who did it. The moderator's account id.
  moderator_id  uuid not null
                  references auth.users (id) on delete cascade,

  -- What they did.
  action        text not null
                  check (action in (
                    'claimed',
                    'under_review',
                    'dismissed',
                    'resolved',
                    'comment_removed',
                    'account_restricted',
                    'restriction_lifted',
                    'comment_restored'
                  )),

  -- The report it concerns. NULL when the action was not about a report.
  report_id     uuid
                  references public.content_reports (id) on delete set null,

  -- The account affected, when there was one.
  target_user_id uuid
                  references auth.users (id) on delete set null,

  -- The content affected, when there was content.
  target_comment_id uuid
                  references public.profile_comments (id) on delete set null,

  -- The internal note. A reason, or a fuller account of what was decided.
  note          text
                  check (note is null or char_length(btrim(note)) <= 4000),

  -- When it happened.
  created_at    timestamptz not null default now()
);

-- The audit trail for one report.
create index if not exists moderation_audit_log_report_idx
  on public.moderation_audit_log (report_id, created_at desc);

-- The audit trail for one moderator — "what has this moderator done?".
create index if not exists moderation_audit_log_moderator_idx
  on public.moderation_audit_log (moderator_id, created_at desc);

-- The trail over time, newest first.
create index if not exists moderation_audit_log_created_idx
  on public.moderation_audit_log (created_at desc);

-- -----------------------------------------------------------------------------
-- 7. THE APPEND-ONLY TRIGGER
-- -----------------------------------------------------------------------------
--
-- The last line of defence for the audit log.
--
-- A policy can be wrong. A privilege can be granted by mistake. This trigger
-- refuses the statement regardless of who is asking, and it refuses it from
-- inside the table itself, so it holds even for the owner.
--
create or replace function public.moderation_audit_log_is_append_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'the moderation audit log is append-only';
end;
$$;

drop trigger if exists moderation_audit_log_no_update on public.moderation_audit_log;
create trigger moderation_audit_log_no_update
  before update on public.moderation_audit_log
  for each row
  execute function public.moderation_audit_log_is_append_only();

drop trigger if exists moderation_audit_log_no_delete on public.moderation_audit_log;
create trigger moderation_audit_log_no_delete
  before delete on public.moderation_audit_log
  for each row
  execute function public.moderation_audit_log_is_append_only();

-- -----------------------------------------------------------------------------
-- 8. THE RESTRICTION CHECK
-- -----------------------------------------------------------------------------
--
-- Is this account restricted right now?
--
-- The question is asked by the RLS policy that guards comment posting, so it
-- has to be answerable by a client role. It returns a BOOLEAN and never a
-- row.
--
-- SECURITY DEFINER because the restriction table hides its rows from the
-- restricted account — a person who is restricted should not be able to
-- enumerate the moderation decisions made about them.
--
-- An EXPIRED restriction is not a restriction. The check is on `expires_at`,
-- not only on `lifted_at`, so a restriction that was never lifted but has run
-- out of time stops applying on its own.
--
create or replace function public.is_restricted(account_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    account_uuid is not null
    and exists (
      select 1
      from public.account_restrictions r
      where r.user_id = account_uuid
        and r.lifted_at is null
        and (r.expires_at is null or r.expires_at > now())
    ),
    false
  );
$$;

-- -----------------------------------------------------------------------------
-- 9. THE AUDIT WRITE
-- -----------------------------------------------------------------------------
--
-- The one place an audit record is created.
--
-- Every write to the audit log goes through here, so the shape of a record is
-- decided in one place rather than in six.
--
-- It is SECURITY DEFINER, so the write lands with the owner's rights and the
-- client needs no INSERT privilege on the table. It is NOT callable by a
-- client role: the moderation functions call it from inside, with the
-- owner's rights.
--
create or replace function public.write_moderation_audit(
  action_name text,
  report_uuid uuid default null,
  target_uuid uuid default null,
  comment_uuid uuid default null,
  note_text text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.moderation_audit_log (
    moderator_id,
    action,
    report_id,
    target_user_id,
    target_comment_id,
    note
  )
  values (
    (select auth.uid()),
    action_name,
    report_uuid,
    target_uuid,
    comment_uuid,
    note_text
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 10. THE MODERATION ACTIONS
-- -----------------------------------------------------------------------------
--
-- Each of these is a SECURITY DEFINER function that performs ONE moderation
-- action, writes the audit record, and refuses to run for anybody who is not
-- a moderator.
--
-- They are functions rather than direct table writes for two reasons:
--
--   1. the audit record is written in the SAME transaction as the change, so
--      a moderator action cannot exist without its audit trail, and an audit
--      trail cannot claim a change that did not happen;
--   2. the client holds no INSERT/UPDATE/DELETE privilege on the moderation
--      tables at all, so the only way to act is through a function that
--      checks the roster first.
--
-- Each function re-checks the roster rather than trusting the caller, because
-- the caller's identity comes from the JWT and the roster from the database,
-- and the two are read at the moment of the action.
--
-- -----------------------------------------------------------------------------
-- 10a. CLAIM A REPORT
-- -----------------------------------------------------------------------------
--
-- The moderator takes ownership of a report. It is bookkeeping, not a
-- consequential act, so it needs no reason.
--
create or replace function public.moderation_claim_report(report_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_status text;
begin
  if not public.is_moderator() then
    raise exception 'you are not a moderator';
  end if;

  select status into target_status
  from public.content_reports
  where id = report_uuid
  for update;

  if target_status is null then
    raise exception 'that report could not be found';
  end if;

  update public.content_reports
  set assigned_to = (select auth.uid())
  where id = report_uuid;

  insert into public.moderation_actions (
    report_id, moderator_id, action, reason, status_after
  )
  values (
    report_uuid, (select auth.uid()), 'claimed', null, target_status
  );

  perform public.write_moderation_audit(
    'claimed', report_uuid, null, null, null
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 10b. MOVE A REPORT UNDER REVIEW
-- -----------------------------------------------------------------------------
--
create or replace function public.moderation_start_review(
  report_uuid uuid,
  note_text text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_moderator() then
    raise exception 'you are not a moderator';
  end if;

  update public.content_reports
  set status = 'reviewed',
      assigned_to = coalesce(assigned_to, (select auth.uid())),
      moderator_note = note_text
  where id = report_uuid
    and status = 'open';

  if not found then
    raise exception 'that report is not open';
  end if;

  insert into public.moderation_actions (
    report_id, moderator_id, action, reason, status_after
  )
  values (
    report_uuid, (select auth.uid()), 'under_review', note_text, 'reviewed'
  );

  perform public.write_moderation_audit(
    'under_review', report_uuid, null, null, note_text
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 10c. DISMISS A REPORT
-- -----------------------------------------------------------------------------
--
-- The report was reviewed and found to be fine.
--
-- A dismissal is a decision, so it needs a reason — the same rule the CHECK
-- constraint on `moderation_actions` enforces. "Nothing was wrong with it" is
-- a reason.
--
create or replace function public.moderation_dismiss_report(
  report_uuid uuid,
  reason_text text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_moderator() then
    raise exception 'you are not a moderator';
  end if;

  if reason_text is null or char_length(btrim(reason_text)) = 0 then
    raise exception 'a dismissal needs a reason';
  end if;

  update public.content_reports
  set status = 'dismissed',
      resolved_at = now(),
      assigned_to = coalesce(assigned_to, (select auth.uid())),
      moderator_note = reason_text
  where id = report_uuid
    and status in ('open', 'reviewed');

  if not found then
    raise exception 'that report is not open or under review';
  end if;

  insert into public.moderation_actions (
    report_id, moderator_id, action, reason, status_after
  )
  values (
    report_uuid, (select auth.uid()), 'dismissed', reason_text, 'dismissed'
  );

  perform public.write_moderation_audit(
    'dismissed', report_uuid, null, null, reason_text
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 10d. RESOLVE A REPORT
-- -----------------------------------------------------------------------------
--
-- The report was reviewed and something was done about it.
--
-- The report is marked 'actioned' and closed. This function does NOT remove
-- a comment and does NOT restrict an account — those are separate,
-- separately-confirmed actions, and a moderator may resolve a report as
-- 'actioned' only after taking them.
--
create or replace function public.moderation_resolve_report(
  report_uuid uuid,
  reason_text text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_moderator() then
    raise exception 'you are not a moderator';
  end if;

  if reason_text is null or char_length(btrim(reason_text)) = 0 then
    raise exception 'a resolution needs a reason';
  end if;

  update public.content_reports
  set status = 'actioned',
      resolved_at = now(),
      assigned_to = coalesce(assigned_to, (select auth.uid())),
      moderator_note = reason_text
  where id = report_uuid
    and status in ('open', 'reviewed');

  if not found then
    raise exception 'that report is not open or under review';
  end if;

  insert into public.moderation_actions (
    report_id, moderator_id, action, reason, status_after
  )
  values (
    report_uuid, (select auth.uid()), 'resolved', reason_text, 'actioned'
  );

  perform public.write_moderation_audit(
    'resolved', report_uuid, null, null, reason_text
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 10e. REMOVE A COMMENT
-- -----------------------------------------------------------------------------
--
-- The comment is taken down.
--
-- The comment row is NOT deleted: its body is REPLACED with a marker, so the
-- moderation history still refers to something real, and so a mistaken
-- removal can be undone.
--
-- The body is replaced rather than the row being deleted. That is what makes
-- the removal RESTORABLE, and it also means the removed text is no longer
-- readable by anybody — a removed comment must not keep its content lying
-- around where a moderator could read it back out.
--
create or replace function public.moderation_remove_comment(
  comment_uuid uuid,
  reason_text text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  comment_author uuid;
  matching_report uuid;
  matching_status text;
begin
  if not public.is_moderator() then
    raise exception 'you are not a moderator';
  end if;

  if reason_text is null or char_length(btrim(reason_text)) = 0 then
    raise exception 'a removal needs a reason';
  end if;

  select author_id into comment_author
  from public.profile_comments
  where id = comment_uuid
    and body <> '[removed by a moderator]'
  for update;

  if comment_author is null then
    raise exception 'that comment could not be found';
  end if;

  -- The report this removal answers, if there is one.
  select id, status into matching_report, matching_status
  from public.content_reports
  where comment_id = comment_uuid
    and status in ('open', 'reviewed')
  order by created_at
  limit 1;

  /*
   * The comment's body is REPLACED, and the row is kept.
   *
   * The replacement text is a fixed marker rather than the original, because
   * a removed comment's text must not remain readable — by the profile's
   * followers, or by a moderator looking at the row later.
   *
   * The row is kept so the audit trail's reference to it resolves, and so the
   * removal can be undone.
   */
  update public.profile_comments
  set body = '[removed by a moderator]',
      updated_at = now()
  where id = comment_uuid;

  insert into public.moderation_actions (
    report_id,
    moderator_id,
    action,
    target_user_id,
    target_comment_id,
    reason,
    status_after
  )
  values (
    matching_report,
    (select auth.uid()),
    'comment_removed',
    comment_author,
    comment_uuid,
    reason_text,
    matching_status
  );

  perform public.write_moderation_audit(
    'comment_removed',
    matching_report,
    comment_author,
    comment_uuid,
    reason_text
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 10f. RESTORE A COMMENT
-- -----------------------------------------------------------------------------
--
-- The removal was a mistake, and the comment comes back.
--
-- The ORIGINAL TEXT IS NOT RESTORED, because it was deliberately destroyed
-- when the comment was removed — that is what made the removal safe. What is
-- restored is the comment's PLACE: it stops being a removed comment, so it is
-- visible again as an empty-bodied comment rather than staying hidden.
--
-- This is the honest behaviour: a removal cannot be undone perfectly, and
-- pretending otherwise would be worse than saying so.
--
create or replace function public.moderation_restore_comment(
  comment_uuid uuid,
  reason_text text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  comment_author uuid;
  matching_report uuid;
  matching_status text;
begin
  if not public.is_moderator() then
    raise exception 'you are not a moderator';
  end if;

  if reason_text is null or char_length(btrim(reason_text)) = 0 then
    raise exception 'a restoration needs a reason';
  end if;

  select author_id into comment_author
  from public.profile_comments
  where id = comment_uuid
    and body = '[removed by a moderator]'
  for update;

  if comment_author is null then
    raise exception 'that comment could not be found';
  end if;

  update public.profile_comments
  set body = '[restored by a moderator]',
      updated_at = now()
  where id = comment_uuid;

  select id, status into matching_report, matching_status
  from public.content_reports
  where comment_id = comment_uuid
    and status in ('open', 'reviewed')
  order by created_at
  limit 1;

  insert into public.moderation_actions (
    report_id,
    moderator_id,
    action,
    target_user_id,
    target_comment_id,
    reason,
    status_after
  )
  values (
    matching_report,
    (select auth.uid()),
    'comment_restored',
    comment_author,
    comment_uuid,
    reason_text,
    matching_status
  );

  perform public.write_moderation_audit(
    'comment_restored',
    matching_report,
    comment_author,
    comment_uuid,
    reason_text
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 10g. RESTRICT AN ACCOUNT
-- -----------------------------------------------------------------------------
--
-- A documented, reversible limit on the account.
--
-- The function takes the account's USERNAME, not its id, and resolves it
-- against the profiles table — the same shape the rest of the application
-- uses, so a moderator cannot restrict an account that does not exist and
-- cannot accidentally restrict the wrong one.
--
-- THE PARAMETER IS NAMED `handle`, NOT `username`.
--
-- `username` is a column of `public.profiles`, and plpgsql resolves an
-- unqualified name against BOTH the parameters and the columns of the table
-- in the statement. A parameter called `username` therefore makes every
-- reference to that name ambiguous, and the function fails at RUN time with
-- 'column reference "username" is ambiguous'. `handle` collides with
-- nothing, and it is the name the other two handle-resolving functions in
-- this file already use.
--
-- A parameter cannot be RENAMED with `CREATE OR REPLACE` — Postgres refuses
-- it with 'cannot change name of input parameter' — so the old definition is
-- dropped first. Nothing depends on the function: no policy, rule or trigger
-- calls it by name, and the client reaches it only through the RPC endpoint.
--
drop function if exists public.moderation_restrict_account(text, text, text, integer);

create or replace function public.moderation_restrict_account(
  handle text,
  reason_text text,
  scope_name text default 'posting',
  days integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  matching_report uuid;
  matching_status text;
  lapse timestamptz;
begin
  if not public.is_moderator() then
    raise exception 'you are not a moderator';
  end if;

  if reason_text is null or char_length(btrim(reason_text)) = 0 then
    raise exception 'a restriction needs a reason';
  end if;

  if scope_name <> 'posting' then
    raise exception 'that is not a restriction scope';
  end if;

  if days is not null and (days < 1 or days > 3650) then
    raise exception 'a restriction must last between 1 and 3650 days';
  end if;

  select p.user_id into target_id
  from public.profiles p
  where p.username = lower(btrim(handle));

  if target_id is null then
    raise exception 'that account could not be found';
  end if;

  if target_id = (select auth.uid()) then
    raise exception 'a moderator cannot restrict their own account';
  end if;

  -- The report this restriction answers, if there is one about that account.
  select r.id, r.status into matching_report, matching_status
  from public.content_reports r
  where r.profile_id = target_id
    and r.status in ('open', 'reviewed')
  order by r.created_at
  limit 1;

  lapse := case
    when days is null then null
    else now() + make_interval(days => days)
  end;

  insert into public.account_restrictions (
    user_id,
    report_id,
    scope,
    reason,
    applied_by,
    expires_at
  )
  values (
    target_id,
    matching_report,
    scope_name,
    reason_text,
    (select auth.uid()),
    lapse
  );

  insert into public.moderation_actions (
    report_id,
    moderator_id,
    action,
    target_user_id,
    reason,
    status_after
  )
  values (
    matching_report,
    (select auth.uid()),
    'account_restricted',
    target_id,
    reason_text,
    matching_status
  );

  perform public.write_moderation_audit(
    'account_restricted',
    matching_report,
    target_id,
    null,
    reason_text
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 10h. LIFT A RESTRICTION
-- -----------------------------------------------------------------------------
--
-- The restriction is lifted. The row is KEPT, with `lifted_at` set, so the
-- record of what happened to the account is not lost by tidying up.
--
create or replace function public.moderation_lift_restriction(
  restriction_uuid uuid,
  reason_text text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  target_report uuid;
  target_status text;
begin
  if not public.is_moderator() then
    raise exception 'you are not a moderator';
  end if;

  if reason_text is null or char_length(btrim(reason_text)) = 0 then
    raise exception 'lifting a restriction needs a reason';
  end if;

  select user_id, report_id into target_id, target_report
  from public.account_restrictions
  where id = restriction_uuid
    and lifted_at is null
  for update;

  if target_id is null then
    raise exception 'that restriction is not in force';
  end if;

  select status into target_status
  from public.content_reports
  where id = target_report;

  update public.account_restrictions
  set lifted_at = now(),
      lifted_by = (select auth.uid())
  where id = restriction_uuid;

  insert into public.moderation_actions (
    report_id,
    moderator_id,
    action,
    target_user_id,
    reason,
    status_after
  )
  values (
    target_report,
    (select auth.uid()),
    'restriction_lifted',
    target_id,
    reason_text,
    target_status
  );

  perform public.write_moderation_audit(
    'restriction_lifted',
    target_report,
    target_id,
    null,
    reason_text
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 10i. READING WHAT A REPORT IS ABOUT
-- -----------------------------------------------------------------------------
--
-- A moderator has to be able to SEE the thing a report is about.
--
-- The ordinary read path is not enough for that. `profiles` is readable only
-- by its owner and its accepted followers, and a comment is readable only
-- where its profile is readable — so a report about a PRIVATE profile would
-- show a moderator nothing at all: no handle, no comment text, and no way to
-- tell whether the report is even about the right thing.
--
-- These three functions are the moderator's read path. They are SECURITY
-- DEFINER, so they see the rows the RLS policies hide, and each one checks
-- `is_moderator()` before returning anything at all.
--
-- They take and return batches, because a queue page holds twenty reports
-- and twenty round-trips per page would make the dashboard crawl.
--
-- They return a JSON document rather than a row, so the shape of the answer
-- is decided in one place and the client cannot ask for a column it should
-- not see.
--
-- -----------------------------------------------------------------------------
-- 10i-1. THE PROFILES A PAGE OF REPORTS IS ABOUT
-- -----------------------------------------------------------------------------
--
create or replace function public.moderation_profile_summaries(account_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_moderator() then
    raise exception 'you are not a moderator';
  end if;

  if account_ids is null or cardinality(account_ids) = 0 then
    return '[]'::jsonb;
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'userId', p.user_id,
          'username', p.username,
          'displayName', nullif(
            btrim(coalesce(p.profile_state ->> 'displayName', '')),
            ''
          )
        )
      )
      from public.profiles p
      where p.user_id = any(account_ids)
    ),
    '[]'::jsonb
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 10i-2. THE COMMENTS A PAGE OF REPORTS IS ABOUT
-- -----------------------------------------------------------------------------
--
create or replace function public.moderation_comment_summaries(comment_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_moderator() then
    raise exception 'you are not a moderator';
  end if;

  if comment_ids is null or cardinality(comment_ids) = 0 then
    return '[]'::jsonb;
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'body', c.body,
          'authorUsername', (
            select p.username from public.profiles p where p.user_id = c.author_id
          ),
          'profileUsername', (
            select p.username from public.profiles p where p.user_id = c.profile_id
          )
        )
      )
      from public.profile_comments c
      where c.id = any(comment_ids)
    ),
    '[]'::jsonb
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 10i-3. THE ACCOUNT BEHIND A USERNAME
-- -----------------------------------------------------------------------------
--
-- The dashboard's search box takes a report id or a username. A username has
-- to be resolved to an account id before the report query can filter on it,
-- and the `profiles` SELECT policy hides a private profile from a moderator
-- who is not one of its followers.
--
-- So the resolution is done here, by a function that sees the whole table
-- and returns only the one id it was asked for.
--
create or replace function public.moderation_resolve_username(handle text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_moderator() then
    raise exception 'you are not a moderator';
  end if;

  return (
    select p.user_id
    from public.profiles p
    where lower(p.username) = lower(btrim(handle))
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 11. THE RLS POLICIES
-- -----------------------------------------------------------------------------
--
-- The rules, stated once:
--
--   - the ROSTER is readable by moderators, and by nobody else;
--   - the ROSTER is writable by NOBODY through a client;
--   - a REPORT is readable by its reporter AND by moderators;
--   - a REPORT is changed only by moderators, through the functions above;
--   - a MODERATION ACTION is readable by moderators, and by nobody else;
--   - a RESTRICTION is readable by moderators, and by nobody else — including
--     the restricted account, which must not be able to enumerate the
--     decisions made about it;
--   - the AUDIT LOG is readable by moderators, and by nobody else;
--   - NO client role creates, updates or deletes any of these.
--
alter table public.moderators enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.account_restrictions enable row level security;
alter table public.moderation_audit_log enable row level security;

-- -----------------------------------------------------------------------------
-- 11a. The roster
-- -----------------------------------------------------------------------------
--
drop policy if exists "moderators can read the roster" on public.moderators;
create policy "moderators can read the roster"
  on public.moderators
  for select
  to authenticated
  using (public.is_moderator());

-- There is deliberately NO insert, update or delete policy on the roster. A
-- client that could INSERT into it could make itself a moderator, and a
-- client that could DELETE could remove a moderator. Neither is possible.

-- -----------------------------------------------------------------------------
-- 11b. The reports
-- -----------------------------------------------------------------------------
--
-- The existing policy lets a reporter read their own report. This one adds
-- moderators.
--
drop policy if exists "moderators can read any report" on public.content_reports;
create policy "moderators can read any report"
  on public.content_reports
  for select
  to authenticated
  using (public.is_moderator());

-- A moderator changes a report through the functions, which write with the
-- definer's rights.
--
-- There is deliberately NO update policy for moderators on `content_reports`.
--
-- The functions already do the work, and a policy that let a moderator PATCH
-- a report row directly would be a second, weaker door to the same state —
-- one with no audit trail behind it. The absence of the policy is the
-- boundary: a direct PostgREST PATCH on a report is refused.
--
-- The reporter's own update policy from Phase 8 stays, so a reporter can
-- still withdraw their own report.

-- -----------------------------------------------------------------------------
-- 11c. The moderation actions
-- -----------------------------------------------------------------------------
--
drop policy if exists "moderators can read moderation actions" on public.moderation_actions;
create policy "moderators can read moderation actions"
  on public.moderation_actions
  for select
  to authenticated
  using (public.is_moderator());

-- No insert, update or delete policy. The actions are written by the
-- functions.

-- -----------------------------------------------------------------------------
-- 11d. The restrictions
-- -----------------------------------------------------------------------------
--
drop policy if exists "moderators can read restrictions" on public.account_restrictions;
create policy "moderators can read restrictions"
  on public.account_restrictions
  for select
  to authenticated
  using (public.is_moderator());

-- No insert, update or delete policy. The restrictions are written by the
-- functions, and a restriction can only be LIFTED through the function —
-- which is what stops an account from editing its own restriction away.

-- -----------------------------------------------------------------------------
-- 11e. The audit log
-- -----------------------------------------------------------------------------
--
drop policy if exists "moderators can read the audit log" on public.moderation_audit_log;
create policy "moderators can read the audit log"
  on public.moderation_audit_log
  for select
  to authenticated
  using (public.is_moderator());

-- No insert, update or delete policy. The log is written by
-- `write_moderation_audit`, and the append-only trigger refuses an update or
-- a delete even from the owner.

-- -----------------------------------------------------------------------------
-- 12. THE RESTRICTION ENFORCEMENT
-- -----------------------------------------------------------------------------
--
-- A restricted account cannot post a comment.
--
-- The guard is here, on the comment INSERT policy, rather than in the
-- application, because an application-side check is a check the client can
-- skip.
--
-- The existing policy is REPLACED rather than added to, because Postgres
-- combines permissive policies with OR: leaving the original in place would
-- mean a restricted account could still comment, because the row would only
-- have to satisfy ONE of the two.
--
-- The replacement is written out in full below rather than relying on the
-- original, so the rule is readable in one place.
--
drop policy if exists "callers can comment on profiles they may comment on" on public.profile_comments;
create policy "callers can comment on profiles they may comment on"
  on public.profile_comments
  for insert
  to authenticated
  with check (
    (select auth.uid()) = author_id
    and public.can_comment_on(profile_id)
    and not public.is_restricted((select auth.uid()))
  );

-- -----------------------------------------------------------------------------
-- 13. THE PRIVILEGE LOCK
-- -----------------------------------------------------------------------------
--
-- The same shape as migrations 0009, 0013 and 0015: revoke first, then grant
-- exactly what the application needs, and nothing more.
--
-- `anon` gets nothing at all.
--
-- `authenticated` gets SELECT on the moderation tables — and ONLY select. A
-- moderator's writes go through the SECURITY DEFINER functions, which run
-- with the owner's rights, so the client needs no INSERT/UPDATE/DELETE
-- privilege on any of them.
--
-- The FUNCTIONS are revoked from every client role as well, and then granted
-- back to `authenticated` — because the application's own server route calls
-- them with the MODERATOR'S SESSION, not with the service role.
--
-- The moderation functions are safe to expose to a client role, because each
-- one checks `is_moderator()` itself, and that check reads the caller's own
-- verified identity. A non-moderator who calls one gets a refusal and no
-- change. The two functions that are NOT granted back are the ones that
-- would be unsafe: `grant_moderator` (which creates moderators) and
-- `write_moderation_audit` (which writes the audit log directly, and so
-- could forge a record).
--
revoke all on table public.moderators from public, anon, authenticated;
revoke all on table public.moderation_actions from public, anon, authenticated;
revoke all on table public.account_restrictions from public, anon, authenticated;
revoke all on table public.moderation_audit_log from public, anon, authenticated;

grant select on table public.moderators to authenticated;
grant select on table public.moderation_actions to authenticated;
grant select on table public.account_restrictions to authenticated;
grant select on table public.moderation_audit_log to authenticated;

-- The content_reports table gains columns, so its grant is restated.
revoke all on table public.content_reports from public, anon, authenticated;
grant select, insert, update, delete on table public.content_reports to authenticated;

-- The functions. Revoked from every client role.
revoke all on function public.is_moderator() from public, anon, authenticated;
revoke all on function public.is_restricted(uuid) from public, anon, authenticated;
revoke all on function public.write_moderation_audit(text, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.moderation_claim_report(uuid) from public, anon, authenticated;
revoke all on function public.moderation_start_review(uuid, text) from public, anon, authenticated;
revoke all on function public.moderation_dismiss_report(uuid, text) from public, anon, authenticated;
revoke all on function public.moderation_resolve_report(uuid, text) from public, anon, authenticated;
revoke all on function public.moderation_remove_comment(uuid, text) from public, anon, authenticated;
revoke all on function public.moderation_restore_comment(uuid, text) from public, anon, authenticated;
revoke all on function public.moderation_restrict_account(text, text, text, integer) from public, anon, authenticated;
revoke all on function public.moderation_lift_restriction(uuid, text) from public, anon, authenticated;
revoke all on function public.moderation_profile_summaries(uuid[]) from public, anon, authenticated;
revoke all on function public.moderation_comment_summaries(uuid[]) from public, anon, authenticated;
revoke all on function public.moderation_resolve_username(text) from public, anon, authenticated;
revoke all on function public.moderation_audit_log_is_append_only() from public, anon, authenticated;

-- The two that a POLICY needs to call.
--
-- `is_moderator` is the qualifier on four SELECT policies, and
-- `is_restricted` is the qualifier on the comment insert policy. Postgres
-- evaluates a policy with the QUERYING role's rights, so the role that runs
-- the policy must be able to execute it.
--
grant execute on function public.is_moderator() to authenticated;
grant execute on function public.is_restricted(uuid) to authenticated;

-- The moderation actions, called with the moderator's own session.
--
-- Each one re-checks the roster, so granting EXECUTE does not grant the
-- POWER: a non-moderator calling `moderation_dismiss_report` gets a refusal
-- from the function and no change to the database.
grant execute on function public.moderation_claim_report(uuid) to authenticated;
grant execute on function public.moderation_start_review(uuid, text) to authenticated;
grant execute on function public.moderation_dismiss_report(uuid, text) to authenticated;
grant execute on function public.moderation_resolve_report(uuid, text) to authenticated;
grant execute on function public.moderation_remove_comment(uuid, text) to authenticated;
grant execute on function public.moderation_restore_comment(uuid, text) to authenticated;
grant execute on function public.moderation_restrict_account(text, text, text, integer) to authenticated;
grant execute on function public.moderation_lift_restriction(uuid, text) to authenticated;

-- The moderator's read path. Each one checks `is_moderator()` itself, so
-- granting EXECUTE grants the ABILITY TO ASK, not the ability to read.
grant execute on function public.moderation_profile_summaries(uuid[]) to authenticated;
grant execute on function public.moderation_comment_summaries(uuid[]) to authenticated;
grant execute on function public.moderation_resolve_username(text) to authenticated;

-- The trigger function. A trigger fires with the table owner's rights
-- regardless of who called the DML, so revoking EXECUTE does not stop it
-- from firing.
grant execute on function public.moderation_audit_log_is_append_only() to postgres;

-- -----------------------------------------------------------------------------
-- 14. THE GRANT METHOD
-- -----------------------------------------------------------------------------
--
-- How the FIRST moderator is created.
--
-- There is no application code path that inserts a row into `moderators`, and
-- there is no route, no form and no API for granting the role. The only way
-- is a human running SQL against the database, which means the role is
-- granted deliberately, by somebody with database access — who is, by
-- definition, already more powerful than a moderator.
--
-- The script that does it is `scripts/grant-moderator.mjs`. It uses the
-- Management API's query endpoint, so it needs the project's access token,
-- and it never prints a credential.
--
-- The function below is the database-side half: it is SECURITY DEFINER, it
-- refuses to run unless the caller holds a trusted server role, and it writes
-- the audit trail.
--
-- It is REVOKED from every client role, so no account can call it.
--
-- THE PARAMETER IS NAMED `handle`, NOT `username`.
--
-- `username` is a column of `public.profiles`, and plpgsql resolves an
-- unqualified name against BOTH the parameters and the columns of the table
-- in the statement. A parameter called `username` therefore makes every
-- reference to that name ambiguous, and the function fails at RUN time with
-- 'column reference "username" is ambiguous'. `handle` collides with
-- nothing, and it is the name the other handle-resolving functions in this
-- file already use.
--
-- A parameter cannot be RENAMED with `CREATE OR REPLACE` — Postgres refuses
-- it with 'cannot change name of input parameter' — so the old definition is
-- dropped first. Nothing depends on the function: it is revoked from every
-- client role, and the operator script calls it by name.
--
drop function if exists public.grant_moderator(text, text);

create or replace function public.grant_moderator(
  handle text,
  note_text text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
begin
  /*
   * Only an operator may grant the role.
   *
   * The check is on the CALLER's Postgres role, not on a flag: the roster is
   * not the thing being granted, so it cannot be the thing that authorises
   * the grant.
   */
  if session_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'only an operator may grant the moderator role';
  end if;

  select p.user_id into target_id
  from public.profiles p
  where p.username = lower(btrim(handle));

  if target_id is null then
    raise exception 'that account could not be found';
  end if;

  insert into public.moderators (user_id, granted_by, note)
  values (target_id, null, note_text)
  on conflict (user_id) do update
    set note = coalesce(excluded.note, public.moderators.note);

  return target_id;
end;
$$;

revoke all on function public.grant_moderator(text, text) from public, anon, authenticated;
grant execute on function public.grant_moderator(text, text) to postgres;
grant execute on function public.grant_moderator(text, text) to service_role;
