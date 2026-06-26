-- Migration: create chat_history table (Phase 5 — Chat & mémoire)
-- Run this in your Supabase SQL Editor or via `supabase db push`

-- ── chat_history: per-request conversation log ──
create table if not exists public.chat_history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Index for the dominant access pattern: all messages for a (user, request) in chronological order
create index if not exists idx_chat_history_request_time
  on public.chat_history (user_id, request_id, created_at desc);

-- Index for cleanup / dashboard queries
create index if not exists idx_chat_history_user_time
  on public.chat_history (user_id, created_at desc);

-- RLS: each user sees only their own chat history
alter table public.chat_history enable row level security;

create policy "Users can manage their own chat history"
  on public.chat_history
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Service role bypass for API routes
grant insert, update, delete, select on public.chat_history to service_role;
