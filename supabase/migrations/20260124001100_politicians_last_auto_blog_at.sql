-- Track per-candidate automation cadence for cron (4h per politician)

begin;

alter table public.politicians
  add column if not exists last_auto_blog_at timestamptz null;

create index if not exists politicians_last_auto_blog_at_idx
  on public.politicians (last_auto_blog_at);

commit;

