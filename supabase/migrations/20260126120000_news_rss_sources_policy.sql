-- Add licensing/policy guardrails for RSS ingestion (commercial-safe)
-- Rationale:
-- - Some publishers explicitly restrict RSS usage to personal/non-commercial.
-- - This platform must avoid ingesting/redistributing content without permission.
-- - We therefore require an explicit admin confirmation before a feed is used by the automation engine.

begin;

alter table public.news_rss_sources
  add column if not exists license_confirmed boolean not null default false,
  add column if not exists usage_policy text not null default 'unknown';

-- Expand region_key to support admin UI option "otra" (manual/other)
alter table public.news_rss_sources
  drop constraint if exists news_rss_sources_region_key_check;
alter table public.news_rss_sources
  add constraint news_rss_sources_region_key_check
  check (region_key in ('meta','colombia','otra'));

-- Backfill existing rows to "unknown" policy unless already set.
update public.news_rss_sources
set usage_policy = 'unknown'
where usage_policy is null or usage_policy = '';

-- Default safety: do not treat any existing feed as licensed until an admin explicitly confirms.
update public.news_rss_sources
set license_confirmed = false
where license_confirmed is distinct from false;

commit;

