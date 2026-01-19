-- Internal pixel events (no cookies, no PII): expand analytics_events + tighten inserts

begin;

-- Add fields used by pixel endpoint
alter table public.analytics_events
  add column if not exists source text not null default 'web';

alter table public.analytics_events
  add column if not exists ref text null;

-- Expand event types
alter table public.analytics_events
  drop constraint if exists analytics_events_event_type_check;

alter table public.analytics_events
  add constraint analytics_events_event_type_check
  check (
    event_type in (
      'profile_view',
      'proposal_view',
      'social_click',
      'shared_link_visit',
      'approval_approved',
      'approval_rejected',
      'automation_submitted'
    )
  );

-- source must be web (current contract)
alter table public.analytics_events
  drop constraint if exists analytics_events_source_check;

alter table public.analytics_events
  add constraint analytics_events_source_check
  check (source in ('web'));

-- ref is optional and limited
alter table public.analytics_events
  drop constraint if exists analytics_events_ref_check;

alter table public.analytics_events
  add constraint analytics_events_ref_check
  check (ref is null or ref in ('direct', 'social', 'shared'));

-- Tighten RLS: INSERT should be service-side only.
-- Service role bypasses RLS; authenticated users should not insert.
drop policy if exists "analytics_events_admin_insert" on public.analytics_events;

commit;

