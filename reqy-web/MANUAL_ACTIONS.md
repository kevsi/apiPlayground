# 📋 Manual Actions Required

Ce fichier liste toutes les actions manuelles à effectuer pour terminer la spec ReqlyAI Copilot.
Le code est complet et commité sur master — il reste des opérations d'infrastructure à faire côté Supabase.

---

## 🔴 Priorité 1 — Débloquer l'indexation RAG (Phase 3)

### Symptôme
Erreurs `"Could not find the table 'public.knowledge_chunks' in the schema cache"` lors des upserts via le JS client, alors que `check-rag-schema.ts` confirme que la table existe.

### Fix A — Forcer le refresh du schema cache PostgREST
**Via Supabase Dashboard** (https://supabase.com/dashboard/project/xqshyabkvdmuthsklqpb/sql/new) :

```sql
ALTER TABLE knowledge_chunks ADD COLUMN _refresh_temp text;
ALTER TABLE knowledge_chunks DROP COLUMN _refresh_temp;
```

Le DDL déclenche un re-scan automatique du cache. Attendre ~30 secondes après exécution.

### Fix B (alternative) — Attendre le refresh automatique
PostgREST rafraîchit son cache périodiquement (généralement 30s-2min). Si tu n'es pas pressé, attends simplement 5 minutes et re-tente.

---

## 🟡 Priorité 2 — Appliquer les migrations Supabase

### 2.1 Migration 1 : pgvector + knowledge_chunks (Phase 3.1-3.2)
Fichier : `reqy-web/supabase/migrations/20250626000001_enable_pgvector_and_knowledge_chunks.sql`

Contenu (copier dans SQL Editor) :
```sql
create extension if not exists vector with schema extensions;

create table if not exists public.knowledge_chunks (
  id uuid default gen_random_uuid() primary key,
  content text not null,
  embedding vector(1024) not null,
  source text not null,
  metadata jsonb not null default '{}',
  chunk_index integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_knowledge_chunks_embedding
  on public.knowledge_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create index if not exists idx_knowledge_chunks_source
  on public.knowledge_chunks (source);

-- tsvector column for BM25
alter table public.knowledge_chunks
  add column if not exists tsv tsvector
  generated always as (to_tsvector('english', content)) stored;

create index if not exists idx_knowledge_chunks_tsv
  on public.knowledge_chunks
  using gin (tsv);

-- RPC for vector similarity search
create or replace function public.match_knowledge_chunks(
  query_embedding vector(1024),
  match_count int default 10,
  match_threshold float default 0.3,
  filter_source text default null
)
returns table (
  id uuid, content text, source text, metadata jsonb,
  chunk_index int, similarity float
)
language sql stable as $$
  select kc.id, kc.content, kc.source, kc.metadata, kc.chunk_index,
         1 - (kc.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks kc
  where (filter_source is null or kc.source = filter_source)
    and 1 - (kc.embedding <=> query_embedding) > match_threshold
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_knowledge_chunks to service_role;

alter table public.knowledge_chunks enable row level security;

create policy "Allow authenticated users to read knowledge_chunks"
  on public.knowledge_chunks for select to authenticated using (true);

grant insert, update, delete, select on public.knowledge_chunks to service_role;
```

### 2.2 Migration 2 : chat_history (Phase 5.1-5.2)
Fichier : `reqy-web/supabase/migrations/20250626000002_create_chat_history.sql`

Contenu :
```sql
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

alter table public.chat_history enable row level security;

create policy "Users can manage their own chat history"
  on public.chat_history for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant insert, update, delete, select on public.chat_history to service_role;
```

### 2.3 Activer pgvector
Dashboard → Database → Extensions → chercher `vector` → Enable.

### 2.4 (optionnel) Supabase CLI pour migrations futures
```bash
npm install -g supabase
supabase login
supabase link --project-ref xqshyabkvdmuthsklqpb
supabase db push
```

---

## 🟢 Priorité 3 — Lancer l'indexation réelle des 8 sources (Phase 3.5-3.12)

Une fois le fix PostgREST appliqué et les migrations en place :

```bash
cd reqy-web

# POC data déjà prête (IANA Status Codes)
pnpm exec tsx --env-file=.env.local scripts/index-knowledge-source.ts \
  iana-status-codes scripts/data/http-status-codes-guide.txt

# Sources externes (téléchargeable via fetch Jina Reader)
pnpm exec tsx --env-file=.env.local scripts/index-knowledge-source.ts \
  rfc-9110 https://www.rfc-editor.org/rfc/rfc9110.html
pnpm exec tsx --env-file=.env.local scripts/index-knowledge-source.ts \
  mdn-http https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview
pnpm exec tsx --env-file=.env.local scripts/index-knowledge-source.ts \
  iana-status-codes-full https://www.iana.org/assignments/http-status-codes/http-status-codes.xhtml
pnpm exec tsx --env-file=.env.local scripts/index-knowledge-source.ts \
  rfc-6749 https://www.rfc-editor.org/rfc/rfc6749
pnpm exec tsx --env-file=.env.local scripts/index-knowledge-source.ts \
  rfc-7519 https://www.rfc-editor.org/rfc/rfc7519
pnpm exec tsx --env-file=.env.local scripts/index-knowledge-source.ts \
  graphql-spec https://spec.graphql.org/draft/
pnpm exec tsx --env-file=.env.local scripts/index-knowledge-source.ts \
  owasp-api-top10 https://owasp.org/API-Security/editions/2023/en/0x11-t10/
pnpm exec tsx --env-file=.env.local scripts/index-knowledge-source.ts \
  openapi-3.1 https://spec.openapis.org/oas/v3.1.0
```

**Durée estimée** : ~10h d'appels Jina API cumulés (rate limit 500 RPM sur paid tier).

---

## 🟢 Priorité 4 — Vérifier la qualité du retrieval

```bash
cd reqy-web
pnpm exec vitest run src/ai/cloud-engine/__tests__/rag-eval.test.ts
```

Sortie attendue : `[rag-eval] precision@5 = X.X% (N/10), MRR = 0.XXX`
Objectif raisonnable : precision@5 > 60% sur le golden set.

---

## 🟢 Priorité 5 — Tester le chat persistant

1. Login dans l'app (Supabase auth email/password ou OAuth)
2. Onglet **Chat** dans une réponse → envoie 2-3 messages
3. Recharge la page (F5) — les messages doivent persister
4. Clique sur **Effacer** → l'historique du requestId courant est vidé

---

## ⚙️ Variables d'environnement

`reqy-web/.env.local` doit contenir :
```
NEXT_PUBLIC_SUPABASE_URL=https://xqshyabkvdmuthsklqpb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ton-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<ton-service-role-key>
JINA_API_KEY=<ta-clé-jina>
```

Les 3 premières sont déjà présentes. `JINA_API_KEY` a été ajouté cette session.

---

## 📋 Résumé ultra-rapide

| Action | Où | Quand |
|---|---|---|
| Refresh PostgREST cache | Dashboard SQL Editor | Maintenant |
| Appliquer 2 migrations | Dashboard SQL Editor | Maintenant |
| Activer pgvector | Dashboard → Database → Extensions | Maintenant |
| Lancer 8 indexations | CLI `pnpm exec tsx` | Après refresh |
| Tester rag-eval | CLI `pnpm exec vitest` | Après indexation |
| Tester chat persistant | UI navigateur | Après migration |

**Si tu bloques sur une étape**, le code est dans `reqy-web/src/ai/cloud-engine/` (index-pipeline.ts, rag.ts, jina.ts) et les scripts dans `reqy-web/scripts/`. Tout est commité sur master.
