-- Migration: create sync tables for Reqly cloud sync
-- Run this in your Supabase SQL Editor

-- Drop existing if re-running (careful in production)
-- drop table if exists sync_items cascade;
-- drop table if exists sync_metadata cascade;

-- ── sync_items: generic CRDT-like storage ──
create table if not exists sync_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null,
  item_id text not null,
  workspace_id text,
  payload jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  unique(user_id, item_type, item_id)
);

-- Index for efficient sync queries
create index if not exists idx_sync_items_query
  on sync_items(user_id, workspace_id, item_type, updated_at);

-- Index for item lookups
create index if not exists idx_sync_items_item_id
  on sync_items(user_id, item_type, item_id);

-- RLS: users can only access their own data
alter table sync_items enable row level security;

create policy "Allow users to manage their own sync items"
  on sync_items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── sync_metadata: per-device sync tracking ──
create table if not exists sync_metadata (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade unique,
  device_id text not null,
  last_sync_at timestamptz not null default now()
);

-- RLS
alter table sync_metadata enable row level security;

create policy "Allow users to manage their own sync metadata"
  on sync_metadata
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── grant for service role (server-side API routes) ──
grant insert, update, delete, select on sync_items to service_role;
grant insert, update, delete, select on sync_metadata to service_role;
