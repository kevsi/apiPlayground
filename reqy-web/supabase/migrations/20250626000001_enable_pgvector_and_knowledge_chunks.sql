-- Migration: enable pgvector + create knowledge_chunks table (Phase 3 RAG infra)
-- Run this in your Supabase SQL Editor or via `supabase db push`

-- ── Enable pgvector extension ──
create extension if not exists vector with schema extensions;

-- ── knowledge_chunks: vector store for RAG retrieval ──
create table if not exists public.knowledge_chunks (
  id uuid default gen_random_uuid() primary key,
  content text not null,
  embedding vector(1024) not null,
  source text not null,
  metadata jsonb not null default '{}',
  chunk_index integer not null default 0,
  created_at timestamptz not null default now()
);

-- Index for vector similarity search (ivfflat, cosine distance)
create index if not exists idx_knowledge_chunks_embedding
  on public.knowledge_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Index for source filtering
create index if not exists idx_knowledge_chunks_source
  on public.knowledge_chunks (source);

-- Full-text search index for BM25 hybrid search
create index if not exists idx_knowledge_chunks_fts
  on public.knowledge_chunks
  using gin (to_tsvector('english', content));

-- ── Add a generated tsvector column for cleaner full-text queries ──
alter table public.knowledge_chunks
  add column if not exists tsv tsvector
  generated always as (to_tsvector('english', content)) stored;

create index if not exists idx_knowledge_chunks_tsv
  on public.knowledge_chunks
  using gin (tsv);

-- ── match_knowledge_chunks: vector similarity RPC used by rag.ts ──
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

-- RLS: open for select to all authenticated users (read-only knowledge base)
alter table public.knowledge_chunks enable row level security;

create policy "Allow authenticated users to read knowledge_chunks"
  on public.knowledge_chunks
  for select
  to authenticated
  using (true);

-- Grant write access for server-side API routes (service role bypasses RLS)
grant insert, update, delete, select on public.knowledge_chunks to service_role;
