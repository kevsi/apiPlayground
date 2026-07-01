# ReqlyAI Copilot — Design Spec

**Date** : 2026-06-25
**Auteur** : Alexander S.
**Statut** : Approuvé
**Stack** : Tauri v2 + Next.js + TypeScript + Supabase

---

## 1. Objectif & Non-objectifs

### 1.1 Objectif

Transformer le moteur IA actuel de Reqly (chat + actions JSON) en **ReqlyAI Copilot** : un système hybride local+cloud spécialisé HTTP/API, capable de diagnostiquer 85% des erreurs courantes en < 50ms sans réseau, et d'enrichir les cas complexes via LLM streaming + RAG.

### 1.2 Non-objectifs (YAGNI)

- ❌ Remplacer le chat flottant existant (on l'enrichit, on ne le réécrit pas)
- ❌ Réécrire `use-ai-engine.ts` from scratch (on le refactore par étapes)
- ❌ Changer le format des actions IA existantes (compatibilité préservée)
- ❌ Multi-tenant / partage d'équipe (Phase future)
- ❌ Fine-tuning local d'un LLM (overkill pour ce scope)

### 1.3 Réutilisation de l'existant

Le système actuel reste **le substrat** :

- ✅ `useAIEngine` + `dispatchAIActions` → conservés, étendus
- ✅ `/api/proxy-ai/route.ts` → conservé, étendu pour SSE
- ✅ `useAiContext` (system prompts par page) → conservé
- ✅ Chat flottant + AI Insights page → préservés en UX
- ✅ GraphQL AI + Project Analyzer → conservés
- 🆕 Ajout d'une **couche locale déterministe** en amont du LLM

---

## 2. Architecture cible

```
┌─────────────────────────────────────────────────────────────┐
│  UI Layer (React)                                           │
│  ┌─────────────┐  ┌─────────────┐  ┌───────────────────┐    │
│  │ ReqlyAI     │  │ Floating    │  │ AI Insights       │    │
│  │ Panel       │  │ Chat        │  │ Page              │    │
│  │ (NEW tab)   │  │ (existing)  │  │ (existing)        │    │
│  └──────┬──────┘  └──────┬──────┘  └────────┬──────────┘    │
│         │                │                  │               │
│         └────────────────┴──────────────────┘               │
│                          │                                  │
│                          ▼                                  │
│         ┌─────────────────────────────────┐                 │
│         │  useAIEngine (refactored)       │                 │
│         │  + new: useReqlyAIAssistant()   │                 │
│         └────────────┬────────────────────┘                 │
└──────────────────────┼──────────────────────────────────────┘
                       │ IPC (Tauri) or HTTP
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  src/ai/  (NEW module — co-located with reqy-web)           │
│                                                              │
│  ┌──────────────────────────┐   ┌──────────────────────────┐ │
│  │  Local Engine (P1)       │   │  Cloud Engine (P2+)      │ │
│  │  ─────────────────────   │   │  ─────────────────────   │ │
│  │  • Context Builder       │   │  • Router                │ │
│  │  • 50+ Rules             │   │  • LLM Streaming         │ │
│  │    - auth.ts             │   │  • Prompt Builder        │ │
│  │    - cors.ts             │   │  • RAG Retriever (P3)    │ │
│  │    - format.ts           │   │  • Fallback chain        │ │
│  │    - performance.ts      │   └──────────────────────────┘ │
│  │    - ssl.ts              │                                │
│  │    - server.ts           │   ┌──────────────────────────┐ │
│  │  • Analyzer              │   │  Types (shared)          │ │
│  │  • Confidence scoring    │   │  RequestContext,         │ │
│  └──────────────────────────┘   │  Diagnostic, Fix         │ │
│                                 └──────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                       │
                       ▼ (cloud only)
┌─────────────────────────────────────────────────────────────┐
│  /api/proxy-ai/route.ts (SSE-enabled)                       │
│  • OpenRouter Qwen3-Coder primary                           │
│  • DeepSeek V3 → Claude Haiku 4.5 fallback chain            │
└─────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Supabase (Phase 3+)                                        │
│  • pgvector table: knowledge_chunks (~3000 vectors)         │
│  • chat_history table                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Modèle de données (types partagés)

```typescript
// src/ai/types.ts
// HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS"
// Import depuis "@/lib/types" (déjà défini dans le projet)

export interface RequestContext {
  request: {
    method: HttpMethod
    url: string
    headers: Record<string, string>
    body: unknown
    authType: 'none' | 'bearer' | 'basic' | 'apikey' | 'oauth2'
  }
  response?: {
    status: number
    statusText: string
    headers: Record<string, string>
    body: unknown
    duration: number   // ms
    size: number       // bytes
  }
  error?: {
    message: string
    code: string       // ex: CERT_HAS_EXPIRED, ECONNREFUSED
    type: 'network' | 'ssl' | 'dns' | 'timeout' | 'unknown'
  }
  /**
   * Timestamp de capture du contexte (ms epoch). Sert à mesurer la latence
   * du moteur local (delta entre timestamp et maintenant).
   * Note : `isFromBrowser` retiré — en Tauri tout passe par Rust, en web
   * tout passe par /api/proxy qui gère déjà CORS. Aucune erreur CORS ne
   * peut survenir dans Reqly, donc aucune règle CORS dans le moteur local.
   */
  timestamp: number
}

export type Severity = 'error' | 'warning' | 'info'
export type Confidence = 'certain' | 'probable' | 'uncertain'
export type DiagnosticSource = 'local' | 'llm' | 'rag'

export interface Fix {
  type: 'header' | 'body' | 'url' | 'auth' | 'method'
  description: string
  patch: Partial<RequestContext['request']>
  applyFix: () => Partial<RequestContext['request']>
}

export interface Diagnostic {
  id: string                              // crypto.randomUUID()
  severity: Severity
  category: 'auth' | 'cors' | 'format' | 'performance' | 'ssl' | 'server' | 'business'
  title: string                           // ex: "Token Bearer expiré"
  explanation: string                     // 1-2 phrases
  fix?: Fix
  confidence: Confidence
  source: DiagnosticSource
  references?: Array<{ label: string; url: string }>  // RFC, MDN...
  timestamp: number
}

export interface Rule {
  id: string                              // 'auth.401.bearer.missing'
  category: Diagnostic['category']
  severity: Severity
  match: (ctx: RequestContext) => boolean
  build: (ctx: RequestContext) => Omit<Diagnostic, 'id' | 'timestamp' | 'source'>
}

export interface LLMStreamChunk {
  type: 'start' | 'token' | 'diagnostic' | 'done' | 'error'
  content?: string
  diagnostic?: Diagnostic
  error?: string
}
```

---

## 4. Plan d'implémentation par phases (66 étapes)

### Phase 1 — Fondations locales (P0) — 16 étapes (+ pré-requis 1.0)

> **Pré-requis 1.0** : Dataset d'erreurs HTTP annotées (à créer AVANT toute règle).
> Les règles sont validées contre ce dataset, pas l'inverse. Sans ce socle,
> on risque d'écrire 50 règles à l'aveugle qui couvrent mal les cas réels.

| # | Étape | Dépend de | Effort |
|---|---|---|---|
| **1.0** | **Créer dataset 200 erreurs HTTP annotées** (status, headers, body, diagnostic attendu, fix attendu) — pré-requis de TOUTE la Phase 1 | — | **XL** |
| 1.1 | Créer arborescence `reqy-web/src/ai/` | 1.0 | XS |
| 1.2 | Types partagés `types.ts` (inclut le contrat `Fix.applyFix()`) | 1.1 | S |
| 1.3 | Context Builder (capture requête/réponse) | 1.2 | M |
| 1.4 | `rules/auth.ts` : 401/403 (token manquant, expiré, scope, admin) | 1.2 | M |
| ~~1.5~~ | ~~`rules/cors.ts` : supprimé — CORS géré par le proxy, ne peut pas survenir dans Reqly~~ | — | — |
| 1.5 | `rules/format.ts` : 415, 400, 422, 413 | 1.2 | M |
| 1.6 | `rules/performance.ts` : timeout, body > 1MB, 429 + Retry-After | 1.2 | S |
| 1.7 | `rules/ssl.ts` : CERT, ECONNREFUSED, ENOTFOUND, ETIMEDOUT | 1.2 | S |
| 1.8 | `rules/server.ts` : 500, 502, 503, 504 | 1.2 | S |
| 1.9 | Orchestrateur `analyzer.ts` (séquence + dédup + scoring) | 1.4, 1.5, 1.6, 1.7, 1.8 | M |
| 1.10 | Tests unitaires des règles (validés contre dataset 1.0) | 1.0, 1.9 | L |
| 1.11 | Composant `Panel.tsx` (onglet ReqlyAI) | 1.2 | L |
| 1.12 | Composant `DiagBadge.tsx` | 1.2 | S |
| 1.13 | Composant `FixSuggestion.tsx` | 1.12 | M |
| 1.14 | Intégration `request-tabs-manager.tsx` | 1.11-1.13 | M |
| 1.15 | Indicateur visuel mode (local/cloud) | 1.14 | XS |

> **Note numérotation** : `rules/cors.ts` retiré donc numérotation décalée de 1.5 à 1.8.
> Le contrat `Fix.applyFix()` est défini dans le type (étape 1.2) — c'est juste
> l'interface. L'implémentation concrète par catégorie (header/body/url) reste en Phase 4.

### Phase 2 — LLM streaming (P0) — 11 étapes

| # | Étape | Dépend de | Effort |
|---|---|---|---|
| 2.1 | `cloud-engine/router.ts` (décision local/cloud) | 1.10 | M |
| 2.2 | Config OpenRouter (Qwen3-Coder primary) | 2.1 | S |
| 2.3 | `cloud-engine/llm.ts` (streaming SSE) | 2.2 | L |
| 2.4 | `cloud-engine/prompt.ts` (Prompt Builder dynamique) | 1.3 | L |
| 2.5 | Adapter `/api/proxy-ai/route.ts` pour SSE | 2.3 | M |
| 2.6 | Tests streaming (chunks, erreurs) | 2.5 | M |
| 2.7 | Composant `Chat.tsx` (UI conversation) | 1.12 | L |
| 2.8 | Streaming SSE → UI Next.js | 2.5+2.7 | M |
| 2.9 | Fallback Qwen → DeepSeek → Claude Haiku | 2.3 | M |
| 2.10 | Timeouts (15s) + retry backoff | 2.3 | S |
| 2.11 | Indicateur "Analyse en cours…" + skeleton | 2.8 | S |

### Phase 3 — RAG (P1) — 17 étapes ⚠️ effort révisé

> **⚠️ Réestimation réaliste** : 2-3 semaines, pas 5-6 jours.
> L'indexation de ~3000 chunks avec Jina + pgvector + tuning du chunking
> + hybrid search BM25+vector est lourde la première fois.
> Décomposer en 3 sprints internes (cf. détail après le tableau).

| # | Étape | Dépend de | Effort |
|---|---|---|---|
| 3.1 | Activer `pgvector` sur Supabase | — | XS |
| 3.2 | Schema table `knowledge_chunks` | 3.1 | S |
| 3.3 | Setup Jina Embeddings v3 (clé API + client + rate limit handling) | 3.1 | S |
| 3.4 | **Pipeline d'indexation générique** (chunking + embedding + upsert) | 3.2, 3.3 | L |
| 3.5 | Indexation RFC 9110 (HTTP Semantics) — ~800 chunks | 3.4 | L |
| 3.6 | Indexation MDN Web Docs HTTP — ~600 chunks | 3.4 | L |
| 3.7 | Indexation IANA HTTP Status Codes — ~200 chunks | 3.4 | M |
| 3.8 | Indexation RFC 6749 (OAuth 2.0) — ~300 chunks | 3.4 | M |
| 3.9 | Indexation RFC 7519 (JWT) — ~150 chunks | 3.4 | M |
| 3.10 | Indexation GraphQL Specification — ~400 chunks | 3.4 | L |
| 3.11 | Indexation OWASP API Security Top 10 — ~200 chunks | 3.4 | M |
| 3.12 | Indexation OpenAPI Specification 3.1 — ~350 chunks | 3.4 | L |
| 3.13 | **Tuning chunking** (recouvrement 64, taille 512, métadonnées source) | 3.5-3.12 | M |
| 3.14 | `cloud-engine/rag.ts` (retrieval hybride BM25 + vector + reranking) | 3.13 | L |
| 3.15 | Injection chunks dans Prompt Builder | 2.4, 3.14 | M |
| 3.16 | Cache local des embeddings (IndexedDB) | 3.14 | M |
| 3.17 | **Évaluation qualité retrieval** (golden set 50 questions annotées) | 3.15 | M |

**Découpage interne** :
- Sprint 3A (semaine 1) : 3.1 → 3.4 (infra + pipeline générique)
- Sprint 3B (semaine 2) : 3.5 → 3.12 (indexation massive, ~10h Jina API)
- Sprint 3C (semaine 3) : 3.13 → 3.17 (retrieval, injection, évaluation)

### Phase 4 — Fix auto (P1) — 8 étapes

| # | Étape | Dépend de | Effort |
|---|---|---|---|
| 4.1 | Étendre `Fix` avec `applyFix(): Partial<RequestContext>` | 1.2 | S |
| 4.2 | Implémenter applyFix par catégorie (header/body/url) | 4.1 | M |
| 4.3 | Bouton "Appliquer le fix" dans `FixSuggestion.tsx` | 1.14+4.2 | S |
| 4.4 | Logique modification requête active via `patchRequest` | 4.2 | M |
| 4.5 | Double-clic protection + undo (5s window) | 4.4 | S |
| 4.6 | Raccourci `Ctrl+Shift+F` applique dernier fix | 4.5 | XS |
| 4.7 | Toast de confirmation + animation | 4.4 | S |
| 4.8 | Edge cases : conflit édition utilisateur, requête dirty | 4.4 | M |

### Phase 5 — Chat & mémoire (P2) — 9 étapes

| # | Étape | Dépend de | Effort |
|---|---|---|---|
| 5.1 | Schema `chat_history` | 3.1 | S |
| 5.2 | Migration + index `(request_id, timestamp)` | 5.1 | XS |
| 5.3 | API routes CRUD `/api/ai/chat/[requestId]` | 5.1 | M |
| 5.4 | Persistance par requête (FK `savedRequestId` ou hash) | 5.3 | M |
| 5.5 | UI historique dans `Panel.tsx` | 2.7 | M |
| 5.6 | Auto-détection langue FR/EN + adaptateur | 2.4 | M |
| 5.7 | Citations de specs dans les réponses | 3.14 | M |
| 5.8 | Cache local IndexedDB (Tauri) pour offline | 2.7 | M |
| 5.9 | Raccourcis chat (`Ctrl+Enter`, `Esc`) | 2.7 | XS |

### Phase 6 — Génération (P2) — 7 étapes

| # | Étape | Dépend de | Effort |
|---|---|---|---|
| 6.1 | Refactor `naturalLanguageToRequest` vers `cloud-engine/generate.ts` | 2.4 | M |
| 6.2 | Détection auth type + auto-complétion headers | 6.1 | M |
| 6.3 | Génération body JSON depuis schéma OpenAPI | 6.1 | L |
| 6.4 | Suggestions de tests (nominal, erreur, edge cases) | 6.1 | M |
| 6.5 | UI dédiée "Generate request" : dialog avec preview | 6.1 | L |
| 6.6 | Mode Explain (F4) : décodage JWT, headers, JSON annoté | 1.12 | L |
| 6.7 | Documentation auto depuis collection | 2.4 | M |

### Phase 7 — Optimisation continue (P3) — 7 étapes

| # | Étape | Dépend de | Effort |
|---|---|---|---|
| 7.1 | Cache LRU des réponses fréquentes (IndexedDB) | 2.3 | M |
| 7.2 | Performance monitoring P50/P95 | 1.10+2.3 | S |
| 7.3 | Feedback loop rating diagnostics | 1.12 | M |
| 7.4 | Amélioration règles basée sur logs | 7.3 | L |
| 7.5 | Raccourcis clavier globaux (`Ctrl+Shift+A`) | 1.12 | XS |
| 7.6 | Métriques succès dans dashboard Reqly | 7.2 | M |
| 7.7 | Auto-update base de règles (CDN fetch) | 1.10 | M |

---

## 5. Stratégie de migration (Strangler Fig)

L'IA existante continue de fonctionner. ReqlyAI s'ajoute **en parallèle** dans l'onglet dédié.

```
AVANT (état actuel) :                    APRÈS (cible) :

Chat ─► useAIEngine                      Chat ─► useAIEngine (étendu)
       │                                       │
       ▼                                       ├─► LocalEngine.analyze(ctx) [NEW]
   callAI (LLM)                               │     └─► 50+ rules
   callAIText (LLM)                           │     └─► Diagnostics[]
                                              │
                                              ├─► Si diagnostics certains + fixes
                                              │   └─► Affichage immédiat Panel
                                              │
                                              └─► Si cas complexe
                                                  └─► Router → CloudEngine.streamLLM(ctx)
                                                      └─► callAI/callAIText (existant)
```

---

## 6. Tests & validation

| Niveau | Couverture cible | Outil |
|---|---|---|
| Unitaire (règles) | 100% des 50+ règles | Vitest |
| Intégration (Context Builder) | 90% | Vitest |
| Unitaire (LLM mocké) | 90% | Vitest + vi.mock fetch |
| Performance | P95 < 50ms local, < 800ms LLM first token | Benchmark Vitest |
| E2E | 3 scénarios (auth/CORS/server) | Playwright (optionnel Phase 1) |
| Dataset | 200 erreurs HTTP réelles annotées | Fixture JSON versionnée |

---

## 7. Risques & mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| Règles locales trop permissives → faux positifs | UX dégradée | Score de confiance + seuil minimum `probable` pour affichage |
| Règles locales trop strictes → diagnostics manqués | Valeur produit perdue | Mode "verbose" activable en Settings |
| Régression sur IA existante | Bloquant | Tests de non-régression sur `useAIEngine` avant chaque PR Phase 1 |
| Latence streaming visible | UX dégradée | Skeleton + indicateur "Analyse en cours..." |
| Coût OpenRouter | Moyen | Cache LRU + fallback modèles économiques |
| pgvector indisponible | Bloque Phase 3 | Abstraction `IRagProvider` (in-memory fallback) |

---

## 8. Critères de succès globaux

| Métrique | Cible | Comment mesurer |
|---|---|---|
| Diagnostic local P95 | < 50ms | Benchmark Vitest sur 1000 ctx |
| First token LLM P50 | < 800ms | Logs proxy-ai + dashboard |
| Précision diagnostic | > 90% sur dataset 200 erreurs | Tests annotés |
| Taux d'utilisation bouton "Appliquer" | > 80% des fixes | Analytics Phase 7 |
| Couverture offline | 85% top 50 erreurs HTTP | Analyse statique du coverage des règles |
| Non-régression IA existante | 100% tests verts | CI obligatoire |

---

## 9. Décisions tranchées

1. **Local engine** : JS pur (pas de Tauri Rust pour P1). Portage éventuel Phase 7 si besoin.
2. **LLM Phase 2** : OpenRouter uniquement (Qwen3-Coder primary). Multi-provider Phase 7.
3. **RAG** : démarre en Phase 3 (P1) comme prévu dans le cahier. Effort réel 2-3 semaines, pas 5-6 jours (cf. estimation révisée).
4. **Supabase** : réutilisation du client existant (déjà en place pour auth).
5. **Fix auto — contrat vs implémentation** :
   - **Contrat `Fix.applyFix()`** : défini dans `types.ts` dès l'étape 1.2 (interface seulement).
   - **Implémentation par catégorie** (header/body/url/auth) : Phase 4 étapes 4.1-4.2.
   - **applyFix côté LLM** : Phase 4 étapes 4.3-4.8 (bouton "Appliquer", undo, raccourcis).
6. **Pas de règles CORS dans le moteur local** : supprimé du scope P1. Le proxy `/api/proxy` gère déjà CORS côté serveur, et toutes les requêtes Tauri passent par Rust backend — aucune erreur CORS ne peut survenir dans Reqly. `isFromBrowser` retiré du type `RequestContext` (inutile).
7. **Dataset d'erreurs 200 entrées** : pré-requis `1.0`, AVANT toute écriture de règle. Les règles sont validées contre ce dataset, pas l'inverse.

---

## 10. Première itération

**Phase 1 complète** (16 étapes) — fondation sans laquelle rien d'autre ne tient.

Sous-ensembles livrables :
- **MVP local** (1.1 → 1.11) : moteur pur, testable, zéro UI = ~3 jours
- **MVP UI** (1.12 → 1.16) : composant + intégration = ~2 jours

---

## Annexes

### A. Statistiques

| Phase | Étapes | Effort total | Priorité |
|---|---|---|---|
| P1 Fondations locales | 16 (+ pré-requis 1.0 XL) | ~1 sem (dont 2-3j dataset) | 🟢 P0 |
| P2 LLM streaming | 11 | ~3-4 jours | 🟢 P0 |
| **P3 RAG** | **17** | **~2-3 semaines** ⚠️ | 🟡 P1 |
| P4 Fix auto | 8 | ~2 jours | 🟡 P1 |
| P5 Chat & mémoire | 9 | ~3 jours | 🔵 P2 |
| P6 Génération | 7 | ~4 jours | 🔵 P2 |
| P7 Optimisation | 7 | continu | 🟣 P3 |
| **TOTAL** | **75** | **~10-11 semaines** | |

> L'estimation totale est montée de ~6 à ~10-11 semaines à cause de la
> réestimation réaliste de P3 et de l'ajout du pré-requis dataset (1.0).

### B. Chemin critique

```
P1.0 (dataset) → P1.1 → P1.2 → P1.3 → P1.4-8 → P1.9 → P1.10 → P2.1 → P2.2 → P2.3 → P2.4 → P2.5 → P2.7 → P2.8
```

### C. Carte des dépendances

```
P1 (16) ──┐
          ├──► P2 (11) ──┬──► P4 (8)
          │              │
          │              ├──► P5 (9)
          │              │
          │              └──► P6 (7)
          │
P3 (15) ──┘ (P3 parallèle à P1+P2 ; seule l'étape 3.14 dépend de 2.4)
            (P3 alimente P5 via 5.7 — citations de specs)

P7 (7) ── transverse (touche tout, continu)
```

Note : P3 peut démarrer en parallèle de P1 dès que 3.1, 3.2, 3.3 sont prêts
(activation pgvector + schema + Jina). L'indexation (3.4→3.11) est longue mais
indépendante du moteur local. Le retrieval (3.13) et l'injection (3.14) ne
servent qu'à partir de la Phase 2 (3.14 dépend de 2.4).
