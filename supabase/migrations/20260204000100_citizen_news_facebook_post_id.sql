-- Centro Informativo: track Facebook Page post ID after n8n publishes to "Centro Informativo Ciudadano" page.
-- Meta rules: auto-publishing must go to a Page; we use a single Page for all CI content.

alter table public.citizen_news_posts
  add column if not exists facebook_post_id text null;

alter table public.citizen_news_posts
  add column if not exists facebook_published_at timestamptz null;

comment on column public.citizen_news_posts.facebook_post_id is 'Facebook Graph API post id after publishing to Centro Informativo Ciudadano page (set by n8n callback or response)';
comment on column public.citizen_news_posts.facebook_published_at is 'When the post was published to the Facebook Page (optional, for audit)';
