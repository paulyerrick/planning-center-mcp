-- Planning Center MCP remote connector alpha schema
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.pco_connections (
  id uuid primary key default gen_random_uuid(),
  church_name text,
  pco_organization_id text,
  pco_person_id text,
  pco_person_name text,
  encrypted_access_token text not null,
  encrypted_refresh_token text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.connector_tokens (
  id uuid primary key default gen_random_uuid(),
  pco_connection_id uuid not null references public.pco_connections(id) on delete cascade,
  token_hash text not null unique,
  name text,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.mcp_audit_logs (
  id uuid primary key default gen_random_uuid(),
  pco_connection_id uuid references public.pco_connections(id) on delete set null,
  tool_name text,
  success boolean,
  execution_ms integer,
  created_at timestamptz not null default now()
);

create table if not exists public.service_feedback (
  id uuid primary key default gen_random_uuid(),
  pco_connection_id uuid not null references public.pco_connections(id) on delete cascade,
  service_type_id text not null,
  plan_id text not null,
  plan_title text,
  plan_date text,
  wins jsonb not null default '[]'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  do_again jsonb not null default '[]'::jsonb,
  avoid_next_time jsonb not null default '[]'::jsonb,
  notes text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists connector_tokens_token_hash_idx on public.connector_tokens(token_hash);
create index if not exists connector_tokens_connection_idx on public.connector_tokens(pco_connection_id);
create index if not exists mcp_audit_logs_connection_idx on public.mcp_audit_logs(pco_connection_id);
create index if not exists service_feedback_connection_idx on public.service_feedback(pco_connection_id);
create index if not exists service_feedback_plan_idx on public.service_feedback(service_type_id, plan_id);
create index if not exists service_feedback_tags_idx on public.service_feedback using gin(tags);

-- This app uses the Supabase service role key server-side only.
-- Do not expose these tables through anon/client-side access.
alter table public.pco_connections enable row level security;
alter table public.connector_tokens enable row level security;
alter table public.mcp_audit_logs enable row level security;
alter table public.service_feedback enable row level security;

-- Explicit grants for the Supabase service role used by the Render server.
-- RLS protects anon/authenticated clients; service_role is server-only and bypasses RLS.
grant usage on schema public to service_role;
grant select, insert, update, delete on public.pco_connections to service_role;
grant select, insert, update, delete on public.connector_tokens to service_role;
grant select, insert, update, delete on public.mcp_audit_logs to service_role;
grant select, insert, update, delete on public.service_feedback to service_role;
