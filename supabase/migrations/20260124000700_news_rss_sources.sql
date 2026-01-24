-- RSS sources as additive news signals (admin-managed, active by default)
-- Used by backend as additional structured/official signals; does NOT replace other sources.

begin;

create table if not exists public.news_rss_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region_key text not null, -- meta|colombia
  base_url text not null,
  rss_url text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.news_rss_sources
  drop constraint if exists news_rss_sources_region_key_check;
alter table public.news_rss_sources
  add constraint news_rss_sources_region_key_check
  check (region_key in ('meta','colombia'));

create index if not exists news_rss_sources_region_active_idx
  on public.news_rss_sources (region_key, active);

alter table public.news_rss_sources enable row level security;

drop policy if exists "news_rss_sources_admin_select" on public.news_rss_sources;
create policy "news_rss_sources_admin_select"
on public.news_rss_sources
for select
to authenticated
using (public.is_admin());

drop policy if exists "news_rss_sources_admin_insert" on public.news_rss_sources;
create policy "news_rss_sources_admin_insert"
on public.news_rss_sources
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "news_rss_sources_admin_update" on public.news_rss_sources;
create policy "news_rss_sources_admin_update"
on public.news_rss_sources
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "news_rss_sources_admin_delete" on public.news_rss_sources;
create policy "news_rss_sources_admin_delete"
on public.news_rss_sources
for delete
to authenticated
using (public.is_admin());

-- Seed (idempotent): META
insert into public.news_rss_sources (name, region_key, base_url, rss_url, active)
select v.name, v.region_key, v.base_url, v.rss_url, true
from (
  values
    ('James Informa','meta','https://jamesinforma.com','https://jamesinforma.com/feed/'),
    ('Periódico del Meta','meta','https://www.periodicodelmeta.com','https://www.periodicodelmeta.com/feed/'),
    ('Llano 7 Días','meta','https://llano7dias.com','https://llano7dias.com/feed/'),
    ('Villavicencio al Día','meta','https://villavicencioaldia.com','https://villavicencioaldia.com/feed/')
) as v(name, region_key, base_url, rss_url)
where not exists (
  select 1 from public.news_rss_sources s where s.rss_url = v.rss_url
);

-- Seed (idempotent): COLOMBIA
insert into public.news_rss_sources (name, region_key, base_url, rss_url, active)
select v.name, v.region_key, v.base_url, v.rss_url, true
from (
  values
    ('El Tiempo (General)','colombia','https://www.eltiempo.com','https://www.eltiempo.com/rss'),
    ('El Tiempo (Política)','colombia','https://www.eltiempo.com','https://www.eltiempo.com/rss/politica.xml'),
    ('El Espectador (General)','colombia','https://www.elespectador.com','https://www.elespectador.com/rss/'),
    ('El Espectador (Política)','colombia','https://www.elespectador.com','https://www.elespectador.com/rss/politica/'),
    ('La República','colombia','https://www.larepublica.co','https://www.larepublica.co/rss'),
    ('Semana','colombia','https://www.semana.com','https://www.semana.com/rss'),
    ('Blu Radio','colombia','https://www.bluradio.com','https://www.bluradio.com/rss'),
    ('Noticias Caracol','colombia','https://noticias.caracoltv.com','https://noticias.caracoltv.com/rss'),
    ('RCN Noticias','colombia','https://www.noticiasrcn.com','https://www.noticiasrcn.com/rss.xml')
) as v(name, region_key, base_url, rss_url)
where not exists (
  select 1 from public.news_rss_sources s where s.rss_url = v.rss_url
);

commit;

