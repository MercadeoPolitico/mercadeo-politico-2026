-- Supabase schema draft (foundation)
-- This file is a reference for initializing the DB with tables needed by:
-- - blog posts
-- - candidates
-- - automation metadata
-- - synthetic intelligence (Marleny) traceability
--
-- IMPORTANT:
-- - Apply via Supabase SQL editor or migrations tooling.
-- - Enforce RLS before exposing any tables to anon users.

-- Candidates (public-facing, read-only)
create table if not exists public.candidates (
  id text primary key,
  slug text unique not null,
  name text not null,
  role text not null,
  ballot_number int not null,
  party text null,
  region text not null,
  biography text not null,
  short_bio text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Blog posts (public-facing, read-only)
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  excerpt text null,
  content_md text not null,
  published_at timestamptz null,
  status text not null default 'draft', -- draft|review|published|archived
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Automation runs (audit trail)
create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'n8n',
  workflow_id text null,
  correlation_id text null,
  status text not null default 'received', -- received|processed|failed
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Synthetic intelligence references (traceability)
create table if not exists public.si_events (
  id uuid primary key default gen_random_uuid(),
  system text not null default 'marleny',
  task text not null,
  correlation_id text null,
  input jsonb not null default '{}'::jsonb,
  output jsonb null,
  status text not null default 'received', -- received|completed|failed
  created_at timestamptz not null default now()
);

-- AI drafts (review queue)
-- Stored by n8n or future server-side tooling (not by the generate endpoint).
create table if not exists public.ai_drafts (
  id uuid primary key default gen_random_uuid(),
  candidate_id text not null,
  content_type text not null, -- proposal|blog|social
  topic text not null,
  tone text null,
  generated_text text not null,
  source text not null default 'web', -- web|n8n|manual
  status text not null default 'pending_review', -- pending_review|approved|rejected|edited
  reviewer_notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

