-- OAuth connections for publishing to social networks (server-only).
-- Goals:
-- - Allow an admin to generate a link and a network owner to connect via OAuth.
-- - Store tokens encrypted at rest (ciphertext only).
-- - Keep existing consent-by-link flow intact (no breaking changes).

begin;

-- 1) Short-lived OAuth state (CSRF protection)
create table if not exists public.social_oauth_states (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('meta','x','reddit')),
  candidate_id text not null references public.politicians(id) on delete cascade,
  state_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists social_oauth_states_candidate_idx on public.social_oauth_states(candidate_id);
create index if not exists social_oauth_states_expires_idx on public.social_oauth_states(expires_at);

-- 2) Stored OAuth connections (encrypted tokens)
create table if not exists public.social_oauth_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('meta','x','reddit')),
  candidate_id text not null references public.politicians(id) on delete cascade,

  -- Remote identity we can publish to (page_id, user_id, subreddit, etc.)
  external_id text not null,
  external_username text,
  display_name text,

  -- Encrypted secrets (ciphertext, not plaintext)
  access_token_enc text not null,
  refresh_token_enc text,
  expires_at timestamptz,
  scopes text,

  status text not null default 'active' check (status in ('active','revoked','expired')),
  connected_at timestamptz not null default now(),
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists social_oauth_connections_unique on public.social_oauth_connections(provider, candidate_id, external_id);
create index if not exists social_oauth_connections_candidate_idx on public.social_oauth_connections(candidate_id);

-- RLS: no direct client access (server uses service role).
alter table public.social_oauth_states enable row level security;
alter table public.social_oauth_connections enable row level security;

commit;

