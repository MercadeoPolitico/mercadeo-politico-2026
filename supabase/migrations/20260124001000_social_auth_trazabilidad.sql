-- Social authorization: add traceability (who/when) without exposing secrets

begin;

alter table public.politician_social_auth_invites
  add column if not exists authorized_by_name text null;

alter table public.politician_social_auth_invites
  add column if not exists authorized_by_email text null;

alter table public.politician_social_auth_invites
  add column if not exists authorized_by_phone text null;

alter table public.politician_social_auth_invites
  add column if not exists authorized_ip text null;

alter table public.politician_social_auth_invites
  add column if not exists authorized_user_agent text null;

alter table public.politician_social_destinations
  add column if not exists authorized_by_name text null;

alter table public.politician_social_destinations
  add column if not exists authorized_by_email text null;

alter table public.politician_social_destinations
  add column if not exists authorized_by_phone text null;

commit;

