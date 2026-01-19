-- Panel de Seguimiento Ciudadano: minimal, no-PII analytics events

begin;

-- 1) Social network attachment status (admin-side)
alter table public.politician_social_links
  add column if not exists status text not null default 'active';

alter table public.politician_social_links
  drop constraint if exists politician_social_links_status_check;

alter table public.politician_social_links
  add constraint politician_social_links_status_check
  check (status in ('active', 'inactive'));

-- 2) Analytics events (NO PII)
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  candidate_id text not null,
  event_type text not null,
  municipality text null,
  content_id uuid null,
  occurred_at timestamptz not null default now()
);

-- Allowed event types (expandable, but deterministic)
alter table public.analytics_events
  drop constraint if exists analytics_events_event_type_check;

alter table public.analytics_events
  add constraint analytics_events_event_type_check
  check (
    event_type in (
      'approval_approved',
      'approval_rejected',
      'automation_submitted'
    )
  );

alter table public.analytics_events enable row level security;

-- Read access: authenticated admins only (politicians never query raw tables)
drop policy if exists "analytics_events_admin_select" on public.analytics_events;
create policy "analytics_events_admin_select"
on public.analytics_events
for select
to authenticated
using (public.is_admin());

-- Insert access: authenticated admins only (service role bypasses RLS for server-side writes)
drop policy if exists "analytics_events_admin_insert" on public.analytics_events;
create policy "analytics_events_admin_insert"
on public.analytics_events
for insert
to authenticated
with check (public.is_admin());

commit;

