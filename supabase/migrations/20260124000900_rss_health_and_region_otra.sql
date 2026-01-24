-- RSS sources: allow 'otra' + store automatic health snapshots (no manual inputs)

begin;

-- 1) Allow region_key = 'otra' (besides meta/colombia)
alter table public.news_rss_sources
  drop constraint if exists news_rss_sources_region_key_check;
alter table public.news_rss_sources
  add constraint news_rss_sources_region_key_check
  check (region_key in ('meta','colombia','otra'));

-- 2) Automatic health snapshot fields (admin-only visibility; safe)
alter table public.news_rss_sources
  add column if not exists last_health_status text null; -- ok|warn|down

alter table public.news_rss_sources
  add column if not exists last_health_checked_at timestamptz null;

alter table public.news_rss_sources
  add column if not exists last_health_http_status int null;

alter table public.news_rss_sources
  add column if not exists last_health_ms int null;

alter table public.news_rss_sources
  add column if not exists last_health_error text null;

alter table public.news_rss_sources
  add column if not exists last_item_count int null;

create index if not exists news_rss_sources_health_idx
  on public.news_rss_sources (last_health_status, last_health_checked_at desc);

commit;

