-- Add routing fields for n8n auto-routing (metadata.destinations canonical shape)
-- These fields are admin-managed, contain NO secrets, and are safe to expose to n8n payloads.
--
-- network_key: canonical network identifier used for routing in n8n
-- scope: target type (page/profile/channel)
-- target_id: page_id/account_id/channel_id (or handle/username where applicable)
-- credential_ref: reference name for n8n credential selection (no secrets)

begin;

alter table public.politician_social_destinations
  add column if not exists network_key text null;

alter table public.politician_social_destinations
  add column if not exists scope text not null default 'profile';

alter table public.politician_social_destinations
  add column if not exists target_id text null;

alter table public.politician_social_destinations
  add column if not exists credential_ref text null;

alter table public.politician_social_destinations
  drop constraint if exists politician_social_destinations_scope_check;

alter table public.politician_social_destinations
  add constraint politician_social_destinations_scope_check
  check (scope in ('page','profile','channel'));

create index if not exists politician_social_destinations_network_key_idx
  on public.politician_social_destinations (network_key);

commit;

