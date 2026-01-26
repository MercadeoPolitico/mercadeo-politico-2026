-- Add Meta government API feed + LlanoAlMundo RSS feed (idempotent)
-- Note: licensing guardrails require explicit confirmation for non-government publishers.

begin;

-- META (Gobernación): JSON API feed used by their SPA. Treat as open government source.
insert into public.news_rss_sources (name, region_key, base_url, rss_url, active, license_confirmed, usage_policy, updated_at)
select v.name, v.region_key, v.base_url, v.rss_url, v.active, v.license_confirmed, v.usage_policy, now()
from (
  values
    (
      'Gobernación del Meta (API)',
      'meta',
      'https://meta.gov.co',
      'https://devx.meta.gov.co/api/noticias-inicio/?format=json',
      true,
      true,
      'open_government'
    )
) as v(name, region_key, base_url, rss_url, active, license_confirmed, usage_policy)
where not exists (
  select 1 from public.news_rss_sources s where s.rss_url = v.rss_url
);

-- META (regional media): RSS is available, but usage terms are unknown → require manual confirmation.
insert into public.news_rss_sources (name, region_key, base_url, rss_url, active, license_confirmed, usage_policy, updated_at)
select v.name, v.region_key, v.base_url, v.rss_url, v.active, v.license_confirmed, v.usage_policy, now()
from (
  values
    (
      'Llano al Mundo (RSS)',
      'meta',
      'https://llanoalmundo.com',
      'https://llanoalmundo.com/feed/',
      true,
      false,
      'unknown'
    )
) as v(name, region_key, base_url, rss_url, active, license_confirmed, usage_policy)
where not exists (
  select 1 from public.news_rss_sources s where s.rss_url = v.rss_url
);

commit;

