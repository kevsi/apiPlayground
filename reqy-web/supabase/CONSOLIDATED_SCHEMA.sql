-- ============================================================
-- ReqlyAI Copilot — Schéma SQL consolidé (idempotent)
-- ============================================================
-- À exécuter UNE SEULE FOIS dans Supabase SQL Editor
-- (https://supabase.com/dashboard/project/xqshyabkvdmuthsklqpb/sql/new)
--
-- Ce script est idempotent : il peut être relancé sans erreur.
-- Il consolide les migrations du projet en un seul bloc.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Extensions
-- ────────────────────────────────────────────────────────────
create extension if not exists "vector" with schema extensions;
-- pgcrypto est activé par défaut sur Supabase (pour gen_random_uuid)

-- ────────────────────────────────────────────────────────────
-- 2. Tables
-- ────────────────────────────────────────────────────────────

-- 2.1 knowledge_chunks : vector store RAG (pgvector)
create table if not exists public.knowledge_chunks (
  id uuid default gen_random_uuid() primary key,
  content text not null,
  embedding vector(1024) not null,
  source text not null,
  metadata jsonb not null default '{}',
  chunk_index integer not null default 0,
  created_at timestamptz not null default now(),
  tsv tsvector generated always as (to_tsvector('english', content)) stored
);

create index if not exists idx_knowledge_chunks_embedding
  on public.knowledge_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create index if not exists idx_knowledge_chunks_source
  on public.knowledge_chunks (source);

create index if not exists idx_knowledge_chunks_fts
  on public.knowledge_chunks
  using gin (to_tsvector('english', content));

create index if not exists idx_knowledge_chunks_tsv
  on public.knowledge_chunks
  using gin (tsv);

-- 2.4 chat_history : historique chat persistant par requête
create table if not exists public.chat_history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_history_request_time
  on public.chat_history (user_id, request_id, created_at desc);

create index if not exists idx_chat_history_user_time
  on public.chat_history (user_id, created_at desc);

-- ────────────────────────────────────────────────────────────
-- 3. Fonction RPC : match_knowledge_chunks (recherche vectorielle)
-- ────────────────────────────────────────────────────────────
create or replace function public.match_knowledge_chunks(
  query_embedding vector(1024),
  match_count int default 10,
  match_threshold float default 0.3,
  filter_source text default null
)
returns table (
  id uuid,
  content text,
  source text,
  metadata jsonb,
  chunk_index int,
  similarity float
)
language sql stable
as $$
  select
    kc.id,
    kc.content,
    kc.source,
    kc.metadata,
    kc.chunk_index,
    1 - (kc.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks kc
  where
    (filter_source is null or kc.source = filter_source)
    and 1 - (kc.embedding <=> query_embedding) > match_threshold
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_knowledge_chunks to service_role;

-- ────────────────────────────────────────────────────────────
-- 4. Row-Level Security (RLS)
-- ────────────────────────────────────────────────────────────

-- 4.1 knowledge_chunks : base de connaissance globale en lecture, service_role pour écriture
alter table public.knowledge_chunks enable row level security;

drop policy if exists "Allow authenticated users to read knowledge_chunks" on public.knowledge_chunks;
create policy "Allow authenticated users to read knowledge_chunks"
  on public.knowledge_chunks
  for select
  to authenticated
  using (true);

-- 4.4 chat_history : chaque user gère ses propres messages
alter table public.chat_history enable row level security;

drop policy if exists "Users can manage their own chat history" on public.chat_history;
create policy "Users can manage their own chat history"
  on public.chat_history
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- 5. Grants pour service_role (API routes côté serveur)
-- ────────────────────────────────────────────────────────────
grant insert, update, delete, select on public.knowledge_chunks to service_role;
grant insert, update, delete, select on public.chat_history    to service_role;

-- ============================================================
-- FIN. Pour vérifier :
--   select tablename, rowsecurity from pg_tables where schemaname='public';
--   select proname from pg_proc where proname='match_knowledge_chunks';
-- ============================================================
