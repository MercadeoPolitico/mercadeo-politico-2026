begin;

-- Extend supported platforms (app + n8n can choose to implement each).
-- This does NOT change RLS; it only relaxes platform constraints.

alter table public.politician_social_links
  drop constraint if exists politician_social_links_platform_check;

alter table public.politician_social_links
  add constraint politician_social_links_platform_check
  check (
    platform in (
      'facebook',
      'instagram',
      'threads',
      'tiktok',
      'x',
      'youtube',
      'website',
      'reddit',
      'telegram',
      'whatsapp',
      'linkedin',
      'other'
    )
  );

alter table public.politician_publications
  drop constraint if exists politician_publications_platform_check;

alter table public.politician_publications
  add constraint politician_publications_platform_check
  check (
    platform in (
      'multi',
      'facebook',
      'instagram',
      'threads',
      'tiktok',
      'x',
      'youtube',
      'reddit',
      'telegram',
      'whatsapp',
      'linkedin'
    )
  );

commit;

