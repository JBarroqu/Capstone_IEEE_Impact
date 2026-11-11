-- Impact++ core: one schema per module (docs/DATA_MODEL.md). Only the API (as the owner role) touches these tables;
-- RLS is enabled with no policies, and the schemas are not exposed to the Data API, so the browser can't reach them.
create extension if not exists citext;

create schema if not exists core;
create schema if not exists profile;
create schema if not exists wish;
create schema if not exists growth;
create schema if not exists social;
create schema if not exists feed;

revoke all on schema core, profile, wish, growth, social, feed from anon, authenticated;

-- Policy overrides from the admin page (key "policy:<KEY>"), model "try first" preference, signing key.
create table core.settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Analytics event log (from the Wish Engine `events` table). Ids are made by the client so a retried batch is stored once.
create table core.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_session_id uuid,
  wish_id uuid,
  name text not null,
  step int,
  payload jsonb not null default '{}'::jsonb,
  app_version text not null,
  provider text,
  client_ts timestamptz,
  created_at timestamptz not null default now()
);
create index events_user_idx on core.events (user_id, created_at);
create index events_name_idx on core.events (name, created_at);

alter table core.settings enable row level security;
alter table core.events enable row level security;
