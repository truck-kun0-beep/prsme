-- =============================================================================
-- PRSME — Phase 8.1: the owner's comment setting
-- =============================================================================
--
-- WHAT THIS IS
--
-- One column: `profiles.comments_enabled`. It lets a profile owner turn
-- comments off on their own profile.
--
-- WHY IT COMES FIRST
--
-- The next migration creates `can_comment_on`, and that function reads this
-- column. Postgres resolves a function body's table references when the
-- function is created, so the column has to exist BEFORE the function does.
-- This file is therefore numbered ahead of the social tables.
--
-- THE DEFAULT IS ON
--
-- `default true` means an existing profile starts with comments enabled. The
-- owner turns them off; they do not have to turn them on.
--
-- The column is NULLABLE with a default, rather than NOT NULL, because the
-- local and remote databases may already hold rows and a NOT NULL column
-- would need a backfill. The policy reads it through `coalesce(..., true)`,
-- which treats NULL as "enabled" — the safe default for a permission.
--
-- Apply with:  supabase db push        (CLI, linked project)
--           or: paste into the Supabase SQL editor
--
-- This migration is additive and safe to re-run.
-- =============================================================================

alter table public.profiles
  add column if not exists comments_enabled boolean default true;

-- Backfill: every existing profile has comments on.
update public.profiles
set comments_enabled = true
where comments_enabled is null;

comment on column public.profiles.comments_enabled is
  'Whether the owner allows comments on this profile. NULL means enabled.';

