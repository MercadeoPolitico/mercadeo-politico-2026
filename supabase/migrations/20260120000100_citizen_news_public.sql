-- Citizen-facing news center + public candidate reads (no PII)
-- Adds:
-- - public.citizen_news_posts (published-only public reads)
-- - public read policies for candidates + active social links
-- - optional fields for scheduling/automation (auto_publish_enabled, ballot_number)

begin;

-- 1) Candidate fields (safe to expose publicly)
alter table public.politicians
  add column if not exists ballot_number int null;

alter table public.politicians
  add column if not exists auto_publish_enabled boolean not null default false;

-- 2) Public select policies (safe: candidate bios/programs are public content)
drop policy if exists "politicians_public_select" on public.politicians;
create policy "politicians_public_select"
on public.politicians
for select
to anon
using (true);

drop policy if exists "politician_social_links_public_select_active" on public.politician_social_links;
create policy "politician_social_links_public_select_active"
on public.politician_social_links
for select
to anon
using (status = 'active');

-- 3) Citizen news center (published content only)
create table if not exists public.citizen_news_posts (
  id uuid primary key default gen_random_uuid(),
  candidate_id text not null references public.politicians(id) on delete cascade,
  slug text unique not null,
  title text not null,
  excerpt text not null default '',
  body text not null,
  media_urls text[] null,
  source_url text null,
  status text not null default 'published',
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.citizen_news_posts
  drop constraint if exists citizen_news_posts_status_check;

alter table public.citizen_news_posts
  add constraint citizen_news_posts_status_check
  check (status in ('draft', 'published', 'archived'));

create index if not exists citizen_news_posts_published_at_idx
  on public.citizen_news_posts (published_at desc);

alter table public.citizen_news_posts enable row level security;

drop policy if exists "citizen_news_posts_public_select" on public.citizen_news_posts;
create policy "citizen_news_posts_public_select"
on public.citizen_news_posts
for select
to anon
using (status = 'published');

drop policy if exists "citizen_news_posts_admin_select" on public.citizen_news_posts;
create policy "citizen_news_posts_admin_select"
on public.citizen_news_posts
for select
to authenticated
using (public.is_admin());

drop policy if exists "citizen_news_posts_admin_insert" on public.citizen_news_posts;
create policy "citizen_news_posts_admin_insert"
on public.citizen_news_posts
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "citizen_news_posts_admin_update" on public.citizen_news_posts;
create policy "citizen_news_posts_admin_update"
on public.citizen_news_posts
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "citizen_news_posts_admin_delete" on public.citizen_news_posts;
create policy "citizen_news_posts_admin_delete"
on public.citizen_news_posts
for delete
to authenticated
using (public.is_admin());

commit;

