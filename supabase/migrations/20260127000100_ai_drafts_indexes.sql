-- Performance: add indexes for common admin queries and pagination
begin;

-- Admin lists drafts ordered by created_at desc (often with pagination).
create index if not exists ai_drafts_created_at_idx
  on public.ai_drafts (created_at desc);

-- Common filtering/grouping by candidate + time.
create index if not exists ai_drafts_candidate_created_at_idx
  on public.ai_drafts (candidate_id, created_at desc);

-- Status views (pending_review/approved/etc) ordered by recency.
create index if not exists ai_drafts_status_created_at_idx
  on public.ai_drafts (status, created_at desc);

-- News center admin views often filter by candidate.
create index if not exists citizen_news_posts_candidate_published_at_idx
  on public.citizen_news_posts (candidate_id, published_at desc);

commit;

