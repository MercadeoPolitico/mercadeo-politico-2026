-- Allow n8n to write analytics_events with source='n8n' (server-side only).
-- Keeps pixel (web) working, no PII, no public reads.

begin;

alter table public.analytics_events
  drop constraint if exists analytics_events_source_check;

alter table public.analytics_events
  add constraint analytics_events_source_check
  check (source in ('web', 'n8n'));

commit;

