-- Create ai_drafts table required by admin panels and variants bridge
-- RLS: admin-only (via public.is_admin()).

begin;

create table if not exists public.ai_drafts (
  id uuid primary key default gen_random_uuid(),
  candidate_id text not null,
  content_type text not null, -- proposal|blog|social
  topic text not null,
  tone text null,
  generated_text text not null,
  variants jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  image_keywords text[] null,
  rotation_window_days int null,
  expires_at timestamptz null,
  source text not null default 'web', -- web|n8n|manual
  status text not null default 'pending_review', -- pending_review|approved|rejected|edited|sent_to_n8n
  reviewer_notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_drafts enable row level security;

drop policy if exists "ai_drafts_admin_select" on public.ai_drafts;
create policy "ai_drafts_admin_select"
on public.ai_drafts
for select
to authenticated
using (public.is_admin());

drop policy if exists "ai_drafts_admin_insert" on public.ai_drafts;
create policy "ai_drafts_admin_insert"
on public.ai_drafts
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "ai_drafts_admin_update" on public.ai_drafts;
create policy "ai_drafts_admin_update"
on public.ai_drafts
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "ai_drafts_admin_delete" on public.ai_drafts;
create policy "ai_drafts_admin_delete"
on public.ai_drafts
for delete
to authenticated
using (public.is_admin());

commit;

