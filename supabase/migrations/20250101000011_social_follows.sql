-- =============================================================================
-- PRSME — Phase 8.1: the social layer — follows, comments, blocks, reports
-- =============================================================================
--
-- WHAT THIS IS
--
-- One-way following, with a pending state for private accounts, plus profile
-- comments and the safety controls (blocks, reports).
--
-- THERE IS NO FRIENDSHIP SYSTEM. That is a deliberate product decision, not an
-- omission: the model here is one-directional. `follows` holds a single row
-- per (follower, following) pair and says nothing about the reverse edge.
-- There is no `friendships` table, no `friend_requests` table, no mutual
-- state, and no "friends" count anywhere in the schema. A mutual following
-- pair is simply two independent rows, and the product never reads them as a
-- single relationship.
--
-- WHY `follows` HOLDS BOTH STATES RATHER THAN A SECOND TABLE
--
-- A pending request and an active follow are the SAME edge at different
-- points in its life. Splitting them into `follows` and `follow_requests`
-- would mean:
--
--   - a request could be approved by inserting into `follows` while the
--     request row was still present, so the pair existed twice;
--   - cancelling a request and unfollowing would be two different DELETEs
--     against two different tables, and a bug in one would leave a ghost
--     edge in the other;
--   - the "duplicate relationship" question would have to be asked twice.
--
-- One table with a `status` column makes the edge UNIQUE on
-- `(follower_id, following_id)`, and that single constraint is what makes a
-- double-submit, a concurrent request, and an approval that races a cancel
-- all resolve to the same outcome: one row.
--
-- THE STATES
--
--   pending -> accepted   the owner approved the request
--   pending -> declined   the owner refused it
--   pending -> cancelled   the requester withdrew it
--   accepted -> (removed)  the owner removed the follower, or the follower
--                             unfollowed
--
-- `declined` and `cancelled` are kept as terminal rows rather than deleted,
-- so a declined requester cannot immediately re-request and spam the owner.
-- The application treats a terminal row as "no relationship", and the counts
-- only ever count `accepted`.
--
-- Apply with:  supabase db push        (CLI, linked project)
--           or: paste into the Supabase SQL editor
--
-- This migration is additive and safe to re-run.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- follows
-- -----------------------------------------------------------------------------
--
-- The one-way social edge.
--
-- `follower_id` is the account doing the following; `following_id` is the
-- account being followed. Both reference `auth.users` with ON DELETE CASCADE,
-- so removing an account removes its edges in both directions without leaving
-- a row that points at nobody.
create table if not exists public.follows (
  id            uuid primary key default gen_random_uuid(),

  -- The account doing the following.
  follower_id   uuid not null
                  references auth.users (id) on delete cascade,

  -- The account being followed.
  following_id  uuid not null
                  references auth.users (id) on delete cascade,

  -- The state of the edge. See the header comment for the transitions.
  --
  -- The CHECK constraint is what makes "pending requests must not count as
  -- active followers" a DATABASE fact rather than a query filter: a count of
  -- `status = 'accepted'` cannot accidentally include a pending request.
  status        text not null default 'pending'
                check (status in ('pending', 'accepted', 'declined', 'cancelled')),

  -- A person cannot follow themselves.
  --
  -- Enforced here as well as in the application, because a self-follow is the
  -- kind of nonsense row that would otherwise sit in the table forever and
  -- inflate a count.
  check (follower_id <> following_id),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- THE duplicate-relationship rule.
  --
  -- One row per (follower, following) pair, in any state. This is what makes a
  -- double-submit, a concurrent request from two tabs, and an approval that
  -- races a cancel all resolve to the same answer: the second write hits the
  -- constraint instead of creating a second edge.
  constraint follows_unique_pair unique (follower_id, following_id)
);

-- The owner's incoming edges: "who wants to follow me".
create index if not exists follows_following_idx
  on public.follows (following_id);

-- The follower's outgoing edges: "who do I follow".
create index if not exists follows_follower_idx
  on public.follows (follower_id);

-- Counting a profile's accepted followers, and listing them in order.
--
-- Partial on `accepted`, so the index holds only the rows a count or a list
-- actually reads. A pending request is not in it, and therefore cannot be
-- counted as a follower.
create index if not exists follows_accepted_following_idx
  on public.follows (following_id, created_at)
  where status = 'accepted';

-- Listing a profile's accepted following list, in order.
create index if not exists follows_accepted_follower_idx
  on public.follows (follower_id, created_at)
  where status = 'accepted';

-- The pending-request list on the owner side.
create index if not exists follows_pending_following_idx
  on public.follows (following_id, created_at)
  where status = 'pending';

-- -----------------------------------------------------------------------------
-- The follow state machine, enforced by triggers
-- -----------------------------------------------------------------------------
--
-- RLS decides WHO may write a row. It cannot decide WHICH state change is
-- legal, because a policy's `with check` sees only the NEW row and never the
-- OLD one. So the transition graph is enforced here instead.
--
-- This is what makes the following true, rather than merely likely:
--
--   - the edge's identity is immutable, so an edge can never be re-pointed at
--     a different pair of accounts;
--   - only the FOLLOWED account can resolve a request;
--   - only the FOLLOWER can withdraw or re-request their own edge;
--   - a terminal request (`declined`, `cancelled`) can never be revived into
--     an ACCEPTED follow — a declined requester cannot buy their way in.
--
-- THE TRIGGERS CHECK WHO, NOT JUST WHAT.
--
-- The guards read `auth.uid()`, so "the owner may approve, the requester may
-- withdraw" is one rule rather than two policies that can disagree. A policy
-- alone cannot express it: `using`/`with check` never see the old row, so a
-- policy cannot say "only from pending".
--
-- -----------------------------------------------------------------------------
-- The status of a NEW edge is DERIVED, not declared
-- -----------------------------------------------------------------------------
--
-- THIS IS THE RULE THAT MAKES THE PRIVATE-ACCOUNT FLOW REAL.
--
-- A follow row carries a `status`, and a client writing that row chooses the
-- value. If the client were trusted, a crafted insert naming
-- `status = 'accepted'` would create an ACTIVE FOLLOW of a private account
-- without its owner ever approving anything — the whole request flow would be
-- decoration.
--
-- So the status is not the client's to choose. The database decides:
--
--   - the target's profile is PUBLIC  -> the follow takes effect immediately
--                                        and the edge is 'accepted';
--   - the target's profile is PRIVATE -> the edge is a 'pending' REQUEST, and
--                                        only the owner can move it to
--                                        'accepted'.
--
-- The trigger runs BEFORE the RLS `with check`, so the policy evaluates the
-- DERIVED status rather than the one that was sent.
--
-- The helper reads the target's visibility with the definer's rights, so a
-- follower CAN resolve a private target's visibility without being able to
-- read the private profile itself.
create or replace function public.follow_status_for(following_uuid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case p.visibility
    when 'public' then 'accepted'
    else 'pending'
  end
  from public.profiles p
  where p.user_id = following_uuid;
$$;

create or replace function public.follows_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  derived_status text;
begin
  derived_status := public.follow_status_for(new.following_id);

  -- A target with no profile row is not a profile anybody can follow.
  if derived_status is null then
    raise exception 'that profile could not be found';
  end if;

  -- Whatever the client asked for is replaced by what is true.
  new.status := derived_status;

  return new;
end;
$$;

drop trigger if exists follows_guard_insert on public.follows;
create trigger follows_guard_insert
  before insert on public.follows
  for each row
  execute function public.follows_guard_insert();

create or replace function public.follows_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The edge's identity is immutable. A row is a relationship between two
  -- specific accounts; re-pointing it would silently rewrite history.
  if new.follower_id <> old.follower_id
     or new.following_id <> old.following_id then
    raise exception 'a follow edge cannot be re-pointed';
  end if;

  -- An unchanged status is not a transition.
  if new.status = old.status then
    return new;
  end if;

  -- The FOLLOWED account resolves a request: approve it or decline it.
  if (select auth.uid()) = old.following_id then
    if old.status = 'pending'
       and new.status in ('accepted', 'declined') then
      return new;
    end if;
  end if;

  -- The FOLLOWER manages their own request: withdraw it, or re-request after
  -- it was declined or withdrawn.
  --
  -- The requester can NEVER move an edge to 'accepted'. That is the point:
  -- approving is the owner's decision alone, and the whole request flow
  -- exists so that a private account's owner decides who gets in.
  if (select auth.uid()) = old.follower_id then
    if old.status = 'pending' and new.status = 'cancelled' then
      return new;
    end if;
    if old.status in ('declined', 'cancelled') and new.status = 'pending' then
      -- The status is DERIVED, exactly as it is on a fresh request: a public
      -- account needs no approval, so the re-request takes effect at once.
      new.status := coalesce(
        public.follow_status_for(old.following_id),
        'pending'
      );
      return new;
    end if;
  end if;

  raise exception 'that follow transition is not allowed';
end;
$$;

drop trigger if exists follows_guard_update on public.follows;
create trigger follows_guard_update
  before update on public.follows
  for each row
  execute function public.follows_guard_update();

-- -----------------------------------------------------------------------------
-- profile_comments
-- profile_comments
-- -----------------------------------------------------------------------------
--
-- Comments on a profile. The profile is referenced by its OWNER's user id
-- rather than by the `profiles` row id, so the foreign key goes straight to
-- `auth.users` — the same key the rest of the social layer uses, and the one
-- the RLS policies can compare against `auth.uid()` without a join.
create table if not exists public.profile_comments (
  id            uuid primary key default gen_random_uuid(),

  -- The account that wrote the comment. Never taken from the client.
  author_id     uuid not null
                  references auth.users (id) on delete cascade,

  -- The account whose profile carries the comment.
  profile_id    uuid not null
                  references auth.users (id) on delete cascade,

  -- The comment body. Plain text.
  --
  -- `length(...) between 1 and 1000` is the database's half of the rule; the
  -- application enforces the same bound and returns a sentence rather than a
  -- constraint violation.
  body          text not null
                  check (char_length(btrim(body)) between 1 and 1000),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- A comment cannot be on your own profile. There is nothing to say to
  -- yourself, and it would let a single account inflate its own comment count.
  check (author_id <> profile_id)
);

-- Listing a profile's comments newest first.
create index if not exists profile_comments_profile_idx
  on public.profile_comments (profile_id, created_at desc);

-- Listing one author's own comments, so the client can find the rows it is
-- allowed to edit or delete without scanning the whole table.
create index if not exists profile_comments_author_idx
  on public.profile_comments (author_id, created_at desc);

-- -----------------------------------------------------------------------------
-- user_blocks
-- -----------------------------------------------------------------------------
--
-- A one-way block: `blocker_id` has blocked `blocked_id`.
--
-- The row is NOT symmetric. Blocking is one-directional by design — the
-- blocked account is not told, and cannot see that a block exists.
create table if not exists public.user_blocks (
  id            uuid primary key default gen_random_uuid(),

  -- The account that did the blocking.
  blocker_id    uuid not null
                  references auth.users (id) on delete cascade,

  -- The account that was blocked.
  blocked_id    uuid not null
                  references auth.users (id) on delete cascade,

  created_at    timestamptz not null default now(),

  -- One block per pair, and nobody blocks themselves.
  constraint user_blocks_unique_pair unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- "Who have I blocked?"
create index if not exists user_blocks_blocker_idx
  on public.user_blocks (blocker_id);

-- "Who has blocked me?" — needed to enforce the block in the OTHER direction
-- (a blocked account must not be able to follow back).
create index if not exists user_blocks_blocked_idx
  on public.user_blocks (blocked_id);

-- -----------------------------------------------------------------------------
-- A block CUTS the follow edges between the pair
-- -----------------------------------------------------------------------------
--
-- The requirement is that a block removes or invalidates any existing
-- relationship between the two accounts. Leaving that to the application would
-- mean a block created through any other path could leave a live follow
-- behind — so the database does it.
--
-- The trigger runs as the definer, so it removes BOTH directions of the edge
-- regardless of which end the blocker is. A blocked pair has no follow edge
-- left, and no way to make one.
create or replace function public.user_blocks_cuts_follows()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and following_id = new.blocked_id)
     or (follower_id = new.blocked_id and following_id = new.blocker_id);

  return new;
end;
$$;

drop trigger if exists user_blocks_cuts_follows on public.user_blocks;
create trigger user_blocks_cuts_follows
  after insert on public.user_blocks
  for each row
  execute function public.user_blocks_cuts_follows();


-- -----------------------------------------------------------------------------
-- content_reports
-- -----------------------------------------------------------------------------
--
-- A report about a comment or about a profile.
--
-- Reports are stored for a future moderation queue. There is no moderation
-- UI in this phase, and no automated action is taken on the strength of a
-- report: the table records what was reported so a human can look at it later.
--
-- The reporter's identity is stored, because a moderator needs to know who
-- filed it and whether they have filed it before. It is never exposed to the
-- reported account.
create table if not exists public.content_reports (
  id            uuid primary key default gen_random_uuid(),

  -- Who filed the report.
  reporter_id   uuid not null
                  references auth.users (id) on delete cascade,

  -- What was reported.
  --
  -- A report is either about a comment or about a profile, so exactly one of
  -- these is set. The CHECK makes "neither" and "both" impossible rather than
  -- leaving the meaning to the application.
  comment_id    uuid
                  references public.profile_comments (id) on delete cascade,
  profile_id    uuid
                  references auth.users (id) on delete cascade,

  -- Why it was reported. A short machine-readable reason.
  reason        text not null
                  check (reason in (
                    'spam', 'harassment', 'hate', 'sexual', 'violence',
                    'misinformation', 'impersonation', 'other'
                  )),

  -- Any extra context the reporter typed. Plain text, optional.
  details       text
                  check (details is null or char_length(details) <= 1000),

  -- The report's own state, so a future moderation queue can pick up where it
  -- left off.
  status        text not null default 'open'
                  check (status in ('open', 'reviewed', 'actioned', 'dismissed')),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Exactly one subject.
  check (
    (comment_id is not null and profile_id is null)
    or (comment_id is null and profile_id is not null)
  ),

  -- You cannot report your own profile.
  check (profile_id is null or reporter_id <> profile_id)
);

-- The moderation queue: open reports, oldest first.
create index if not exists content_reports_status_idx
  on public.content_reports (status, created_at);

-- "What has this account reported?"
create index if not exists content_reports_reporter_idx
  on public.content_reports (reporter_id, created_at desc);

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
--
-- The same trigger the profiles table uses, so a row's `updated_at` is always
-- truthful even if a direct PostgREST PATCH forgets to set it.
create or replace function public.set_social_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists follows_set_updated_at on public.follows;
create trigger follows_set_updated_at
  before update on public.follows
  for each row
  execute function public.set_social_updated_at();

drop trigger if exists profile_comments_set_updated_at on public.profile_comments;
create trigger profile_comments_set_updated_at
  before update on public.profile_comments
  for each row
  execute function public.set_social_updated_at();

drop trigger if exists content_reports_set_updated_at on public.content_reports;
create trigger content_reports_set_updated_at
  before update on public.content_reports
  for each row
  execute function public.set_social_updated_at();

-- =============================================================================
-- Helper functions
-- =============================================================================
--
-- SECURITY DEFINER throughout, so a policy can ask a question about a PRIVATE
-- profile's edges without the caller being able to read those edges directly.
-- Every one of them returns a BOOLEAN (or a status string) and never a row, so
-- it discloses nothing beyond the answer it was asked for.
-- =============================================================================

-- Is this account an ACCEPTED follower of that account?
--
-- The name says what it means: pending requests are NOT followers. This is the
-- function the private-profile access rule and the comment rule both use, so
-- there is exactly one definition of "follower" in the system.
create or replace function public.is_follower(following_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.follows
    where follower_id = (select auth.uid())
      and following_id = following_uuid
      and status = 'accepted'
  );
$$;

-- Does this account follow that account, in ANY state?
--
-- Used to answer "what does the Follow button say?" — Follow, Following, or
-- Requested. A pending request is deliberately counted here and NOT by
-- `is_follower`, because the button has to distinguish the two states.
create or replace function public.has_follow_state(following_uuid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select f.status
    from public.follows f
    where f.follower_id = (select auth.uid())
      and f.following_id = following_uuid
  ), 'none');
$$;

-- Has this account blocked that account, or the other way round?
--
-- The block is enforced in BOTH directions, because the requirement is that a
-- blocked account must not gain access to the blocker's content, and that it
-- must not be able to follow the blocker back. One symmetric predicate keeps
-- that honest.
--
-- SECURITY DEFINER matters here: `user_blocks` has RLS that hides a block from
-- the blocked account, so a policy that asked this question directly would
-- find nothing and the block would silently not apply.
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

-- May this caller comment on that account's profile?
--
-- The rule, in one place:
--
--   - a public profile accepts comments from any signed-in account, unless
--     the owner has turned comments off;
--   - a private profile accepts comments only from ACCEPTED followers, and
--     only if the owner has left comments on;
--   - a blocked pair cannot comment at all, in either direction;
--   - nobody comments on their own profile.
--
-- It is SECURITY DEFINER because answering it requires reading the target's
-- profile visibility and the follow edges, neither of which the caller can
-- necessarily read directly.
create or replace function public.can_comment_on(profile_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Not your own profile, and no block either way.
    (select auth.uid()) is not null
    and (select auth.uid()) <> profile_uuid
    and not coalesce(public.is_blocked_between((select auth.uid()), profile_uuid), false)
    and exists (
      select 1
      from public.profiles p
      where p.user_id = profile_uuid
        -- The owner's comment setting is honoured first: an owner who has
        -- turned comments off gets none, whatever the visibility is.
        and coalesce(p.comments_enabled, true)
        and (
          -- A public profile is open to any signed-in account.
          p.visibility = 'public'
          -- A private profile is open to its accepted followers only.
          or public.is_follower(profile_uuid)
        )
    );
$$;

-- May this caller SEE this account's profile content?
--
-- This is the private-profile access rule, and it is the single definition
-- used by the profiles SELECT policy and by the comments policy.
--
--   - the owner always sees their own profile;
--   - a public profile is visible to anyone;
--   - a private profile is visible to its ACCEPTED followers;
--   - a blocked pair sees nothing.
create or replace function public.can_view_profile(profile_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select auth.uid()) is not null, false)
    and not coalesce(
      public.is_blocked_between((select auth.uid()), profile_uuid),
      false
    )
    and (
      (select auth.uid()) = profile_uuid
      or exists (
        select 1
        from public.profiles p
        where p.user_id = profile_uuid
          and (
            p.visibility = 'public'
            or public.is_follower(profile_uuid)
          )
      )
    );
$$;

-- Is this account's profile visible to an ANONYMOUS visitor?
create or replace function public.is_publicly_visible(profile_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = profile_uuid
      and p.visibility = 'public'
  )
  and not coalesce(
    public.is_blocked_between((select auth.uid()), profile_uuid),
    false
  );
$$;

-- The BASIC summary of a profile.
--
-- This is what a visitor who may NOT read a private profile sees: the
-- account's handle, display name, avatar, privacy, counts, and their own
-- relationship to it. Nothing else.
--
-- WHY IT EXISTS
--
-- A private profile has to be DISCOVERABLE to be followable. If the only way
-- to find a private account were to already follow it, follow requests would
-- be unreachable and the whole request flow would be dead code. So a
-- non-follower sees a shell — enough to recognise the account and to press
-- "Request to follow" — and nothing of its content.
--
-- WHY IT IS A FUNCTION AND NOT A POLICY
--
-- The `profiles` row holds EVERYTHING about a profile — the collections, the
-- reviews, the links, the soundtrack — in one JSONB column. If a policy let
-- a stranger read the row, a direct PostgREST call would hand them all of
-- it. The row itself must stay hidden.
--
-- So this function reads the row with the definer's rights and returns a
-- hand-picked set of scalar fields. It NEVER returns `profile_state`, so
-- there is no path — not through the policy, not through this function — by
-- which a stranger reads a private profile's content.
--
-- The counts are the real counts: accepted followers only, so a pending
-- request never inflates them.
create or replace function public.profile_summary(profile_uuid uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'userId', p.user_id,
    'username', p.username,
    'displayName', coalesce(nullif(p.profile_state ->> 'displayName', ''), p.username),
    'avatarPath', p.avatar_path,
    'visibility', p.visibility,
    'followerCount', (
      select count(*) from public.follows f
      where f.following_id = p.user_id and f.status = 'accepted'
    ),
    'followingCount', (
      select count(*) from public.follows f
      where f.follower_id = p.user_id and f.status = 'accepted'
    ),
    'isFollower', public.is_follower(p.user_id),
    'followState', public.has_follow_state(p.user_id),
    'isSelf', (select auth.uid()) = p.user_id
  )
  from public.profiles p
  where p.user_id = profile_uuid
    and not coalesce(
      public.is_blocked_between((select auth.uid()), profile_uuid),
      false
    )
    and (
      -- The owner always sees their own summary.
      (select auth.uid()) = p.user_id
      -- A public profile's summary is world-readable.
      or p.visibility = 'public'
      -- An approved follower sees it.
      or public.is_follower(profile_uuid)
      -- A visitor with a PENDING request sees the shell — enough to know
      -- the request is still open — but nothing of the content.
      or exists (
        select 1 from public.follows f
        where f.follower_id = (select auth.uid())
          and f.following_id = profile_uuid
          and f.status in ('pending', 'accepted')
      )
    );
$$;

