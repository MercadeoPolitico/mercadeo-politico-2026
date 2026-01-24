-- Add subtitle fields for editorial UI + citizen posts
-- Requirements:
-- - Title must NOT mention the candidate
-- - Subtitle MUST mention candidate + office + key axis (short)
-- - Stored as separate column (no secrets)

begin;

alter table public.ai_drafts
  add column if not exists subtitle text null;

alter table public.citizen_news_posts
  add column if not exists subtitle text null;

commit;

