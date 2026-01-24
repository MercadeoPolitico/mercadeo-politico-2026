-- Social destinations + WhatsApp authorization links (admin-governed)
-- Adds:
-- - public.politician_social_destinations (admin only)
-- - public.politician_social_auth_invites (token-hash based, admin only)
--
-- Notes:
-- - Owners approve/reject via token link handled server-side with service role (no RLS reliance).
-- - Admin panel is the control surface; n8n only receives approved destinations.

begin;

create table if not exists public.politician_social_destinations (
  id uuid primary key default gen_random_uuid(),
  politician_id text not null references public.politicians(id) on delete cascade,

  network_name text not null,
  network_type text not null default 'official', -- official|ally|follower|community|media
  profile_or_page_url text not null,

  owner_name text null,
  owner_contact_phone text null, -- WhatsApp (E.164 or local; stored as text)
  owner_contact_email text null,

  active boolean not null default true,
  authorization_status text not null default 'pending', -- pending|approved|expired|revoked
  last_invite_sent_at timestamptz null,
  authorized_at timestamptz null,
  revoked_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.politician_social_destinations
  drop constraint if exists politician_social_destinations_network_type_check;
alter table public.politician_social_destinations
  add constraint politician_social_destinations_network_type_check
  check (network_type in ('official','ally','follower','community','media'));

alter table public.politician_social_destinations
  drop constraint if exists politician_social_destinations_auth_status_check;
alter table public.politician_social_destinations
  add constraint politician_social_destinations_auth_status_check
  check (authorization_status in ('pending','approved','expired','revoked'));

create index if not exists politician_social_destinations_politician_idx
  on public.politician_social_destinations (politician_id);

create index if not exists politician_social_destinations_auth_idx
  on public.politician_social_destinations (authorization_status, active);

create table if not exists public.politician_social_auth_invites (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references public.politician_social_destinations(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz null,
  decision text null, -- approved|rejected (mapped to destination status)
  created_at timestamptz not null default now()
);

alter table public.politician_social_auth_invites
  drop constraint if exists politician_social_auth_invites_decision_check;
alter table public.politician_social_auth_invites
  add constraint politician_social_auth_invites_decision_check
  check (decision is null or decision in ('approved','rejected'));

create index if not exists politician_social_auth_invites_destination_idx
  on public.politician_social_auth_invites (destination_id, created_at desc);

create index if not exists politician_social_auth_invites_expires_idx
  on public.politician_social_auth_invites (expires_at);

-- RLS: admin-only (service role bypasses RLS for token flows)
alter table public.politician_social_destinations enable row level security;
alter table public.politician_social_auth_invites enable row level security;

drop policy if exists "politician_social_destinations_admin_select" on public.politician_social_destinations;
create policy "politician_social_destinations_admin_select"
on public.politician_social_destinations
for select
to authenticated
using (public.is_admin());

drop policy if exists "politician_social_destinations_admin_insert" on public.politician_social_destinations;
create policy "politician_social_destinations_admin_insert"
on public.politician_social_destinations
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "politician_social_destinations_admin_update" on public.politician_social_destinations;
create policy "politician_social_destinations_admin_update"
on public.politician_social_destinations
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "politician_social_destinations_admin_delete" on public.politician_social_destinations;
create policy "politician_social_destinations_admin_delete"
on public.politician_social_destinations
for delete
to authenticated
using (public.is_admin());

drop policy if exists "politician_social_auth_invites_admin_select" on public.politician_social_auth_invites;
create policy "politician_social_auth_invites_admin_select"
on public.politician_social_auth_invites
for select
to authenticated
using (public.is_admin());

drop policy if exists "politician_social_auth_invites_admin_insert" on public.politician_social_auth_invites;
create policy "politician_social_auth_invites_admin_insert"
on public.politician_social_auth_invites
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "politician_social_auth_invites_admin_update" on public.politician_social_auth_invites;
create policy "politician_social_auth_invites_admin_update"
on public.politician_social_auth_invites
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "politician_social_auth_invites_admin_delete" on public.politician_social_auth_invites;
create policy "politician_social_auth_invites_admin_delete"
on public.politician_social_auth_invites
for delete
to authenticated
using (public.is_admin());

commit;

