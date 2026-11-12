-- =============================================================================
-- PRSME — Phase 8.4: the comment posting rate limit
-- =============================================================================
--
-- WHAT THIS IS
--
-- A limit on how fast one account may post comments.
--
-- WHY IT IS IN THE DATABASE
--
-- Everything else in this phase that is a RULE is a rule in the database: the
-- follow state machine is a trigger, the block is a trigger, the comment
-- permission is an RLS policy. A rate limit in the application would be the
-- odd one out.
--
-- It would also be the WEAK one. An application limit is a check in a
-- server-side function, and a server-side function is reachable by anything
-- that can talk to PostgREST — including a crafted request that names the
-- table directly and never touches this application's code at all. The
-- published key is public. So an application-only limit is a limit on the
-- application's own users and no one else.
--
-- A trigger fires for EVERY insert, whoever makes it, and it fires as the
-- table's owner. There is no path to PostgREST that skips it.
--
-- WHAT IT MEASURES
--
-- The number of comments ONE AUTHOR has posted in the last minute. The limit
-- is per author rather than per profile, because the thing being prevented
-- is one account spraying comments across many profiles, and a per-profile
-- limit would let exactly that through.
--
-- The window is short on purpose. A long window would punish an active
-- conversation; the limit exists to stop a burst, not to ration a day.
--
-- Apply with:  supabase db push        (CLI, linked project)
--           or: paste into the Supabase SQL editor
--
-- This migration is additive and safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- The limit
-- -----------------------------------------------------------------------------
--
-- Five comments a minute. That is fast enough that a person commenting
-- several times in a row never notices it, and slow enough that a burst of
-- hundreds is refused.
--
create or replace function public.comment_rate_limit()
returns integer
language sql
stable
as $$
  select 5;
$$;

-- -----------------------------------------------------------------------------
-- The guard
-- -----------------------------------------------------------------------------
--
-- SECURITY DEFINER, so the count sees the author's own comment history
-- regardless of what the caller may read. The SELECT policy on
-- `profile_comments` is "you may read a comment where you may read the
-- profile it sits on", and a stranger may not read either — so a
-- non-definer count would see fewer rows than it should, and the limit would
-- under-count.
--
-- The count is a COUNT of a narrow window rather than a scan: the index on
-- `profile_comments (author_id, created_at desc)` answers it directly.
--
-- The row being inserted is NOT counted, because the trigger runs BEFORE the
-- insert. Within one transaction, a second insert does see the first, so a
-- transaction cannot be used to slip past the limit.
--
create or replace function public.enforce_comment_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
  limit_value integer;
begin
  limit_value := public.comment_rate_limit();

  select count(*) into recent_count
  from public.profile_comments c
  where c.author_id = new.author_id
    and c.created_at > now() - interval '1 minute';

  if recent_count >= limit_value then
    raise exception 'you are commenting too quickly';
  end if;

  return new;
end;
$$;

drop trigger if exists profile_comments_rate_limit on public.profile_comments;
create trigger profile_comments_rate_limit
  before insert on public.profile_comments
  for each row
  execute function public.enforce_comment_rate_limit();

-- -----------------------------------------------------------------------------
-- The privileges
-- -----------------------------------------------------------------------------
--
-- The trigger function is SECURITY DEFINER, so a client role that can
-- EXECUTE it could probe the comment history of an arbitrary account. It is
-- revoked from every client role.
--
-- Revoking EXECUTE does NOT stop the trigger from firing: Postgres checks a
-- trigger function's EXECUTE privilege when the TRIGGER is created, and
-- firing it runs it with the table owner's rights regardless of who called
-- the DML. That behaviour was confirmed against a live database before it
-- was relied on here.
--
-- `comment_rate_limit` is a different matter. It returns a single integer
-- and reads nothing, so there is nothing in it to protect: knowing that the
-- limit is five a minute discloses no comment history and no account's
-- activity. It is granted to `authenticated` so the limit is DISCOVERABLE —
-- the UI can say "you are commenting too quickly" without hard-coding a
-- second copy of the number that could drift from the database's.
--
revoke all on function public.enforce_comment_rate_limit() from public, anon, authenticated;

grant execute on function public.comment_rate_limit() to authenticated;
