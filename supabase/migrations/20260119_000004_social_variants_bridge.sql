-- Phase 2 operational gaps: social normalization + variants + approval→automation bridge fields

begin;

-- 1) Normalize social platform type + url validation
alter table public.politician_social_links
  drop constraint if exists politician_social_links_platform_check;

alter table public.politician_social_links
  add constraint politician_social_links_platform_check
  check (platform in ('facebook', 'instagram', 'threads', 'tiktok', 'x', 'youtube', 'website', 'other'));

alter table public.politician_social_links
  drop constraint if exists politician_social_links_url_check;

alter table public.politician_social_links
  add constraint politician_social_links_url_check
  check (url ~* '^https?://');

-- 2) Variants storage for AI drafts (base + per-network)
alter table public.ai_drafts
  add column if not exists variants jsonb not null default '{}'::jsonb;

-- 3) Publications: add variants + rotation/expires + status normalization
alter table public.politician_publications
  add column if not exists variants jsonb not null default '{}'::jsonb;

alter table public.politician_publications
  add column if not exists rotation_window_days int null;

alter table public.politician_publications
  add column if not exists expires_at timestamptz null;

alter table public.politician_publications
  drop constraint if exists politician_publications_platform_check;

alter table public.politician_publications
  add constraint politician_publications_platform_check
  check (platform in ('multi', 'facebook', 'instagram', 'threads', 'tiktok', 'x', 'youtube'));

alter table public.politician_publications
  drop constraint if exists politician_publications_status_check;

alter table public.politician_publications
  add constraint politician_publications_status_check
  check (status in ('pending_approval', 'approved', 'rejected', 'sent_to_n8n', 'scheduled', 'published'));

commit;

