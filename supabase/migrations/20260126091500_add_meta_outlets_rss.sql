-- Add additional Meta outlets as RSS signals (idempotent)
-- NOTE: These are additive signals; the system still uses other sources (e.g., GDELT).

begin;

insert into public.news_rss_sources (name, region_key, base_url, rss_url, active)
select v.name, v.region_key, v.base_url, v.rss_url, v.active
from (
  values
    -- Llano al Mundo appears to be a WordPress outlet (common RSS at /feed/). If it ever changes,
    -- admin can edit it from Admin → n8n / Redes → Fuentes RSS.
    ('Llano al Mundo','meta','https://llanoalmundo.com','https://llanoalmundo.com/feed/', true)
) as v(name, region_key, base_url, rss_url, active)
where not exists (
  select 1 from public.news_rss_sources s where s.rss_url = v.rss_url
);

commit;

