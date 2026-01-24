begin;

-- Global app settings (public read for specific keys).
-- Used for controlled cache-reset/versioning from Admin Panel.
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

-- Public read: only allow reading the cache version key (no secrets stored here).
drop policy if exists "app_settings_public_select_cache_version" on public.app_settings;
create policy "app_settings_public_select_cache_version"
on public.app_settings
for select
to anon, authenticated
using (key = 'cache_version');

-- Admin write: allow admins to upsert cache_version.
drop policy if exists "app_settings_admin_write" on public.app_settings;
create policy "app_settings_admin_write"
on public.app_settings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into public.app_settings (key, value)
values ('cache_version', '1')
on conflict (key) do nothing;

commit;

