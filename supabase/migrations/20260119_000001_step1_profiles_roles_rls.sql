-- PASO I — Auth + Roles + Super Admin (profiles is source of truth)
-- Safe to run multiple times (IF NOT EXISTS / DO blocks).
-- IMPORTANT: This migration does NOT disable RLS and does NOT add any public wide-open access.

begin;

-- 1) Profiles table (source of truth)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  role text not null,
  created_at timestamptz not null default now()
);

-- Ensure allowed roles (enum-like) without creating a PG enum (easier evolvability).
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('super_admin', 'admin'));

-- Exactly ONE super_admin enforced at DB-level.
-- This prevents accidentally creating a second super_admin profile.
create unique index if not exists profiles_single_super_admin
  on public.profiles (role)
  where role = 'super_admin';

-- 2) Helper function for RLS (no secrets, deterministic)
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'super_admin'
  );
$$;

revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;

-- 3) RLS + policies
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid());

-- INSERT policy MUST use WITH CHECK only (per Postgres rules).
drop policy if exists "profiles_insert_super_admin_only" on public.profiles;
create policy "profiles_insert_super_admin_only"
on public.profiles
for insert
to authenticated
with check (public.is_super_admin());

-- UPDATE: only super_admin can update profiles (including roles).
-- This guarantees an admin cannot elevate roles, and users cannot mutate profile data.
drop policy if exists "profiles_update_super_admin_only" on public.profiles;
create policy "profiles_update_super_admin_only"
on public.profiles
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

commit;

