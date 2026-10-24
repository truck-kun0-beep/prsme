-- =============================================================================
-- Local Supabase-equivalent bootstrap for Phase 6.1 validation.
-- =============================================================================
--
-- WHY THIS FILE EXISTS
--
-- `supabase start` needs Docker, which is not available in this environment,
-- and the Supabase CLI ships no Windows binary. This file recreates the parts
-- of a Supabase Postgres that the PRSME migrations actually depend on, so the
-- REAL migration chain can be applied to a REAL Postgres and the REAL RLS
-- policies can be exercised as real roles.
--
-- It is NOT part of the product. It is test scaffolding for Phase 6.1 and it
-- lives under scripts/localdb/, never in supabase/migrations/.
--
-- WHAT IT RECREATES
--
--   - the roles: anon, authenticated, authenticator, service_role
--   - the `auth` schema with an `auth.users` table
--   - `auth.uid()`, `auth.role()`, and `auth.jwt()` reading the JWT claims
--     that PostgREST sets as `request.jwt.claims`
--   - the `storage` schema with `buckets` and `objects`, plus
--     `storage.foldername()`, because the avatar migration creates policies on
--     it
--
-- The roles, the claim plumbing, and the `auth.uid()` semantics match what
-- Supabase itself does, because that is what the migration chain was written
-- against. The policies under test are the project's own, unmodified.
-- =============================================================================

-- Roles ---------------------------------------------------------------------
-- NOLOGIN: they are switched to with SET ROLE, never logged into directly.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator noinherit login password 'postgres';
  end if;
end
$$;

grant anon, authenticated, service_role to authenticator;

-- The `auth` schema -------------------------------------------------------
create schema if not exists auth;

-- auth.users ---------------------------------------------------------------
-- Supabase's own table. The PRSME migrations reference it as a foreign key
-- target (`references auth.users (id)`), so it must exist before the chain
-- runs. The columns below are the ones Supabase's table has and that the
-- migrations and the local harness touch.
create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  instance_id        uuid,
  aud                text,
  role               text,
  email              text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  invited_at         timestamptz,
  confirmation_token  text,
  confirmation_sent_at timestamptz,
  recovery_token     text,
  recovery_sent_at   timestamptz,
  email_change_token  text,
  email_change       text,
  email_change_sent_at timestamptz,
  last_sign_in_at    timestamptz,
  raw_app_meta_data  jsonb,
  raw_user_meta_data jsonb,
  is_super_admin     boolean,
  created_at         timestamptz,
  updated_at         timestamptz,
  raw_app_meta_data_updated_at timestamptz
);

-- auth.identities ----------------------------------------------------------
-- Supabase keeps a row per identity provider. The local harness creates one
-- per user so the shape matches a real project.
create table if not exists auth.identities (
  id                  uuid primary key default gen_random_uuid(),
  provider_id         text not null,
  user_id             uuid not null references auth.users (id) on delete cascade,
  identity_data       jsonb not null,
  provider            text not null,
  last_sign_in_at     timestamptz,
  created_at          timestamptz,
  updated_at          timestamptz
);

-- The claim readers --------------------------------------------------------
--
-- Supabase's `auth.uid()` reads the `sub` claim out of `request.jwt.claims`,
-- a JSON blob PostgREST sets from the verified JWT on every request. These
-- three functions are the same idea, with the same names and the same
-- behaviour, so the project's policies execute unchanged.
--
-- `current_setting(..., true)` is used rather than `current_setting(...)` so
-- the function returns NULL instead of raising when the GUC is unset — which
-- is what happens for a connection that never set any claims (the `anon` case
-- when no token was supplied).
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    nullif(current_setting('request.jwt.claims', true)::text, ''),
    '{}'
  )::jsonb;
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', current_setting('role', true));
$$;

create or replace function auth.email()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'email', '');
$$;

-- Grants on the auth helpers -----------------------------------------------
grant usage on schema auth to anon, authenticated, service_role, authenticator;
grant execute on function auth.jwt() to anon, authenticated, service_role, authenticator;
grant execute on function auth.uid() to anon, authenticated, service_role, authenticator;
grant execute on function auth.role() to anon, authenticated, service_role, authenticator;
grant execute on function auth.email() to anon, authenticated, service_role, authenticator;

-- The `storage` schema -----------------------------------------------------
-- Supabase's Storage lives in the same database. The avatar migration creates
-- policies on `storage.objects` and inserts a row into `storage.buckets`, so
-- both must exist before the chain runs.
create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  owner              uuid,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create table if not exists storage.objects (
  id                 uuid primary key default gen_random_uuid(),
  bucket_id          text references storage.buckets (id),
  name               text not null,
  owner              uuid,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  metadata           jsonb,
  path_tokens        text[]
);

create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select string_to_array(name, '/');
$$;

grant usage on schema storage to anon, authenticated, service_role, authenticator;
grant select on storage.buckets to anon, authenticated, service_role, authenticator;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role, authenticator;
grant execute on function storage.foldername(text) to anon, authenticated, service_role, authenticator;

-- The `public` schema grants ----------------------------------------------
-- Supabase grants usage on public to the client roles by default. The
-- migration chain re-grants explicitly, so this only has to be permissive
-- enough that the chain's own statements succeed.
grant usage on schema public to anon, authenticated, service_role, authenticator;

-- Default privileges -------------------------------------------------------
-- Supabase's default is broad table privileges plus narrow RLS policies:
-- the GRANT is the outer lock, the POLICY is the inner one. The PRSME
-- migrations rely on this — `profiles` gets no explicit GRANT in the Phase 5
-- migration because on a real project the default already grants it.
--
-- Granting only SELECT here would make every write fail with "permission
-- denied for table ..." before RLS was ever consulted, which would test the
-- wrong thing entirely.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;

-- The existing objects in this schema (created by the bootstrap itself).
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

-- The `pgbouncer`/`pgmeta` schemas are not needed here.
