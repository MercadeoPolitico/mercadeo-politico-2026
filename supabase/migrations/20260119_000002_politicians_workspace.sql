-- Admin workspace for politicians + approval portal (server-controlled access links)
-- This migration adds internal tables for managing politicians, social links, media, and publication approvals.

begin;

-- Helper: admin check (admin OR super_admin)
create or replace function public.is_admin()
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
      and p.role in ('admin', 'super_admin')
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Politicians (internal workspace source of truth)
create table if not exists public.politicians (
  id text primary key,
  slug text unique not null,
  name text not null,
  office text not null,
  party text null,
  region text not null,
  biography text not null default '',
  proposals text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.politicians enable row level security;

drop policy if exists "politicians_admin_select" on public.politicians;
create policy "politicians_admin_select"
on public.politicians
for select
to authenticated
using (public.is_admin());

drop policy if exists "politicians_admin_insert" on public.politicians;
create policy "politicians_admin_insert"
on public.politicians
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "politicians_admin_update" on public.politicians;
create policy "politicians_admin_update"
on public.politicians
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "politicians_admin_delete" on public.politicians;
create policy "politicians_admin_delete"
on public.politicians
for delete
to authenticated
using (public.is_admin());

-- Social links per politician
create table if not exists public.politician_social_links (
  id uuid primary key default gen_random_uuid(),
  politician_id text not null references public.politicians(id) on delete cascade,
  platform text not null, -- facebook|instagram|threads|tiktok|x|youtube|website|other
  handle text null,
  url text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

alter table public.politician_social_links enable row level security;

drop policy if exists "politician_social_links_admin_select" on public.politician_social_links;
create policy "politician_social_links_admin_select"
on public.politician_social_links
for select
to authenticated
using (public.is_admin());

drop policy if exists "politician_social_links_admin_insert" on public.politician_social_links;
create policy "politician_social_links_admin_insert"
on public.politician_social_links
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "politician_social_links_admin_update" on public.politician_social_links;
create policy "politician_social_links_admin_update"
on public.politician_social_links
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "politician_social_links_admin_delete" on public.politician_social_links;
create policy "politician_social_links_admin_delete"
on public.politician_social_links
for delete
to authenticated
using (public.is_admin());

-- Publications (drafts to be approved by politician via exclusive link)
create table if not exists public.politician_publications (
  id uuid primary key default gen_random_uuid(),
  politician_id text not null references public.politicians(id) on delete cascade,
  platform text not null, -- facebook|instagram|threads|tiktok|x
  title text null,
  content text not null,
  media_urls text[] null,
  status text not null default 'pending_approval', -- pending_approval|approved|rejected|scheduled|published
  created_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_at timestamptz null,
  decision_notes text null
);

alter table public.politician_publications enable row level security;

drop policy if exists "politician_publications_admin_select" on public.politician_publications;
create policy "politician_publications_admin_select"
on public.politician_publications
for select
to authenticated
using (public.is_admin());

drop policy if exists "politician_publications_admin_insert" on public.politician_publications;
create policy "politician_publications_admin_insert"
on public.politician_publications
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "politician_publications_admin_update" on public.politician_publications;
create policy "politician_publications_admin_update"
on public.politician_publications
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "politician_publications_admin_delete" on public.politician_publications;
create policy "politician_publications_admin_delete"
on public.politician_publications
for delete
to authenticated
using (public.is_admin());

-- Exclusive access tokens (hashed in DB)
create table if not exists public.politician_access_tokens (
  id uuid primary key default gen_random_uuid(),
  politician_id text not null references public.politicians(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz null,
  last_used_at timestamptz null
);

alter table public.politician_access_tokens enable row level security;

drop policy if exists "politician_access_tokens_admin_select" on public.politician_access_tokens;
create policy "politician_access_tokens_admin_select"
on public.politician_access_tokens
for select
to authenticated
using (public.is_admin());

drop policy if exists "politician_access_tokens_admin_insert" on public.politician_access_tokens;
create policy "politician_access_tokens_admin_insert"
on public.politician_access_tokens
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "politician_access_tokens_admin_delete" on public.politician_access_tokens;
create policy "politician_access_tokens_admin_delete"
on public.politician_access_tokens
for delete
to authenticated
using (public.is_admin());

-- Seed the two politicians (id values match existing candidate_id usage)
insert into public.politicians (id, slug, name, office, party, region, biography, proposals)
values
  (
    'jose-angel-martinez',
    'jose-angel-martinez',
    'José Ángel Martínez',
    'Cámara de Representantes',
    null,
    'Meta',
    '',
    ''
  ),
  (
    'eduardo-buitrago',
    'eduardo-buitrago',
    'Eduard Buitrago Acero',
    'Senado de la República',
    'Salvación Nacional',
    'Meta',
    '',
    ''
  )
on conflict (id) do update
set name = excluded.name,
    office = excluded.office,
    party = excluded.party,
    region = excluded.region;

-- Seed social links (best-effort mapping from provided URLs/handles)
insert into public.politician_social_links (politician_id, platform, handle, url)
values
  -- José Ángel Martínez
  ('jose-angel-martinez', 'facebook', null, 'https://www.facebook.com/JoseAngelFirmesporlaPatria/'),
  ('jose-angel-martinez', 'facebook', null, 'https://www.facebook.com/angelesparavillavicencio7/'),
  ('jose-angel-martinez', 'instagram', '@angelfirmesporlapatria', 'https://www.instagram.com/angelfirmesporlapatria/'),
  ('jose-angel-martinez', 'threads', 'jose.martinez08121978', 'https://www.threads.net/@jose.martinez08121978'),
  ('jose-angel-martinez', 'tiktok', 'jose.angel.martin725', 'https://www.tiktok.com/@jose.angel.martin725'),
  ('jose-angel-martinez', 'x', '@joseangelFirmes', 'https://x.com/joseangelFirmes'),

  -- Eduard Buitrago Acero
  ('eduardo-buitrago', 'x', '@yosoyeduardb', 'https://x.com/yosoyeduardb'),
  ('eduardo-buitrago', 'facebook', null, 'https://www.facebook.com/share/17x8kFiAGs/'),
  ('eduardo-buitrago', 'instagram', null, 'https://www.instagram.com/soyeduardbuitrago?igsh=bnpsNmI2MGZ3azQy'),
  ('eduardo-buitrago', 'youtube', '@soyeduardbuitrago7801', 'https://www.youtube.com/@soyeduardbuitrago7801')
on conflict do nothing;

commit;

