# Reqly — Project Features Documentation

> Documentation exhaustive de toutes les fonctionnalités du projet Reqly.
> Couvre **tous les modules** : API Playground, AI Copilot, Sync, Mock Server, GraphQL, etc.

---

## 📑 Table des matières

1. [Vue d'ensemble](#-vue-densemble)
2. [Architecture technique](#-architecture-technique)
3. [Modules par catégorie](#-modules-par-catégorie)
   - [HTTP Request Playground](#-http-request-playground)
   - [Panneau de réponse](#-panneau-de-réponse)
   - [Historique des requêtes](#-historique-des-requêtes)
   - [Collections](#-collections)
   - [Variables et Environnements](#-variables-et-environnements)
   - [Tests et Assertions](#-tests-et-assertions)
   - [Mock Server](#-mock-server)
   - [Chaining de requêtes](#-chaining-de-requêtes)
   - [GraphQL](#-graphql)
   - [Projets et Workspaces](#-projets-et-workspaces)
   - [Sync Cloud bidirectionnel](#-sync-cloud-bidirectionnel)
   - [Authentification](#-authentification)
   - [Intégration GitHub](#-intégration-github)
   - [Intégration Postman](#-intégration-postman)
   - [Import / Export](#-import--export)
   - [Export OpenAPI](#-export-openapi)
   - [Génération de SDK](#-génération-de-sdk)
   - [Documentation auto](#-documentation-auto)
   - [Dashboard Analytics](#-dashboard-analytics)
   - [Analyse proactive](#-analyse-proactive)
   - [Notifications](#-notifications)
   - [Raccourcis clavier](#-raccourcis-clavier)
   - [Thèmes](#-thèmes)
   - [Sidebar / Navigation](#-sidebar--navigation)
4. [🤖 AI Copilot (ReqlyAI)](#-ai-copilot-reqlyai)
   - [Phase 1 — Moteur local](#phase-1--moteur-local-déterministe)
   - [Phase 2 — Cloud LLM](#phase-2--cloud-llm-streaming)
   - [Phase 3 — RAG](#phase-3--rag-retrieval-augmented-generation)
   - [Phase 4 — Fix auto UX](#phase-4--fix-auto-ux)
   - [Phase 5 — Chat persistant](#phase-5--chat--mémoire)
   - [Phase 6 — Génération](#phase-6--génération-de-requêtes)
   - [Phase 7 — Optimisation continue](#phase-7--optimisation-continue)
5. [🖥️ Desktop Tauri](#️-desktop-tauri)
6. [📦 Packages additionnels](#-packages-additionnels)
7. [🗄️ Base de données Supabase](#️-base-de-données-supabase)
8. [🧪 Tests](#-tests)
9. [🚀 Build & Run](#-build--run)

---

## 🎯 Vue d'ensemble

**Reqly** est une plateforme complète de test d'API, d'inspection de réponses, et de gestion de collections. Elle combine :

- **HTTP Playground** : éditeur de requêtes multi-onglets avec proxy anti-CORS
- **Collections** : arborescence de requêtes sauvegardées
- **AI Copilot** : diagnostic, génération, explanation de requêtes (moteur local + cloud LLM + RAG)
- **Mock Server** : serveur mockable localement ou via Tauri
- **GraphQL** : builder dédié avec introspection
- **Multi-workspace** : personnel + équipes, sync cloud bidirectionnel
- **Desktop** : version native via Tauri (Rust)
- **CLI & MCP** : outils en ligne de commande

Stack : **Next.js 16** + **React 19** + **TypeScript 5.7** + **Tauri 2** + **Supabase**.

---

## 🏛️ Architecture technique

```
┌─────────────────────────────────────────────────────────────┐
│                   UI Layer (React 19)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌───────────────────┐    │
│  │ Request     │  │ Response    │  │ AI ReqlyAI        │    │
│  │ Panel       │  │ Panel       │  │ Panel + Chat      │    │
│  └─────────────┘  └─────────────┘  └───────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Next.js API Routes (App Router)                │
│  /api/proxy    /api/auth    /api/ai/chat   /api/github-*   │
│  /api/mock/*   /api/postman /api/proxy-ai /api/sync        │
└─────────────────────────────────────────────────────────────┘
            │                            │
            ▼                            ▼
┌────────────────────────┐  ┌──────────────────────────────┐
│   Supabase (Postgres)   │  │   Tauri (Rust backend)        │
│   - auth.users          │  │   - File system               │
│   - sync_items          │  │   - Native dialogs            │
│   - sync_metadata       │  │   - Native execution          │
│   - knowledge_chunks    │  │   - Mock server backend       │
│   - chat_history        │  └──────────────────────────────┘
│   - pgvector            │
│   - match_knowledge_*   │
└────────────────────────┘
```

---

## 📦 Modules par catégorie

### 🌐 HTTP Request Playground

#### Éditeur de requêtes
- **Méthodes supportées** : GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- **Onglets multiples** : chaque onglet est une requête indépendante
- **Barre d'adresse** : méthode + URL
- **Header editor** : multi-lignes, key/value, validation
- **Query params editor** : key/value avec encodage automatique
- **Body editor** :
  - JSON (avec colorisation)
  - form-data (multipart)
  - x-www-form-urlencoded
  - raw (texte brut)
  - binary (file upload via Tauri dialog)
- **Authentification** : None, Bearer, Basic, API Key, OAuth 2.0
- **Variables `{{var}}`** : interpolation automatique dans URL, headers, body

**Fichiers :**
- `reqy-web/components/request-panel.tsx`
- `reqy-web/components/request-tabs-manager.tsx`
- `reqy-web/components/request-tab-bar.tsx`
- `reqy-web/components/request-active-toolbar.tsx`
- `reqy-web/components/request-save-dialog.tsx`

#### Proxy API anti-CORS (`/api/proxy`)
- Exécution côté serveur Next.js (contourne les restrictions CORS navigateur)
- **Timeout configurable** par requête
- **Limites** : 10 Mo requête / 5 Mo réponse
- **Protection SSRF** : blocage IP privées + DNS rebinding
- **Rate limiting** : 100 requêtes/min par IP
- **Headers strippés** : hop-by-hop headers retirés automatiquement
- **Streaming response** : pour les bodies volumineux

**Fichier :** `reqy-web/app/api/proxy/route.ts`

---

### 📊 Panneau de réponse

- **Status code** : affiché en gros, coloré par classe (2xx vert, 3xx bleu, 4xx orange, 5xx rouge)
- **Timeline** : DNS / connect / TTFB / total (en ms)
- **Response headers** : tableau triable, recherche, copy-to-clipboard
- **Body viewer** multi-formats :
  - **Pretty** : JSON formaté et colorisé
  - **Raw** : texte brut
  - **Preview** : rendu HTML/markdown
  - **Image** : affichage direct pour les binaires image
- **Snippets de code** auto-générés dans plusieurs langages :
  - cURL
  - fetch (JS)
  - XMLHttpRequest
  - Axios (optionnel)
- **Compteurs** : taille (KB), temps (ms)
- **Bouton "Export"** : save response to file

**Fichiers :**
- `reqy-web/components/response-panel.tsx`
- `reqy-web/components/response-content-renderer.tsx`
- `reqy-web/components/response-code-snippet.tsx`
- `reqy-web/components/response-headers-tab.tsx`
- `reqy-web/components/response-status-bar.tsx`
- `reqy-web/components/response-timeline.tsx`

---

### 📜 Historique des requêtes

- **Stockage localStorage** : jusqu'à ~500 entrées par workspace
- **Regroupement par requête** (méthode + URL)
- **Rejeu** : un clic recharge la requête dans un onglet
- **Nettoyage** : individuel ou complet
- **Recherche** dans l'historique
- **Détails stockés** : timestamp, status, durée, taille, payload complet

**Fichiers :**
- `reqy-web/components/history-panel.tsx`
- `reqy-web/lib/store/history.ts`

---

### 📁 Collections

- **CRUD complet** : create, read, update, delete
- **Arborescence** : collections > dossiers > requêtes (nested folders)
- **Vue liste / cartes** : toggle display mode
- **Drag & drop** : déplacer une requête vers un dossier
- **Réordonnancement** : drag handles
- **Recherche & filtres** : par méthode, par texte
- **Import/Export** : JSON natif Reqly
- **Drawer latéral** : accès rapide dans l'éditeur
- **Bridge vers éditeur** : un clic ouvre la requête dans un nouvel onglet (`request-bridge.ts`)
- **Dédoublonnage** : `openRequestInTab` évite les doublons via `savedRequestId`
- **Sauvegarde rapide** : `Ctrl+S` ou bouton

**Fichiers :**
- `reqy-web/components/collections-panel.tsx`
- `reqy-web/components/collections-drawer.tsx`
- `reqy-web/components/collections-folder-tree.tsx`
- `reqy-web/components/collections-modal.tsx`
- `reqy-web/components/request-save-dialog.tsx`
- `reqy-web/lib/request-bridge.ts`

---

### 🌍 Variables et Environnements

- **Environnements multiples** : `dev`, `staging`, `prod`, custom
- **Variables clé-valeur** : `BASE_URL=https://api.dev.com`
- **Interpolation `{{variable}}`** : dans URLs, headers, body, params
- **Sélection d'environnement actif** : via dropdown
- **Variables au niveau collection** : surchargent les variables globales
- **Variables dans les tests** : résolution automatique
- **Copie rapide** : copy-to-clipboard

**Fichiers :**
- `reqy-web/components/variables-panel.tsx`
- `reqy-web/components/environment-selector.tsx`
- `reqy-web/lib/store/environments.ts`
- `reqy-web/lib/variable-mapping.ts`
- `reqy-web/lib/variable-path.ts`

---

### ✅ Tests et Assertions

- **Assertions JavaScript** : code custom exécuté contre la réponse
- **Catégories** : status code, response time, body, headers, JSONPath
- **Helpers** : `expect(response.status).toBe(200)` etc.
- **Variables `{{var}}`** dans le code des assertions
- **Runner intégré** : exécution séquentielle ou parallèle
- **Résultats détaillés** : passed/failed par assertion avec messages
- **Progress bar** : batch-run-progress.tsx
- **Historique des runs** : timestamps et résultats

**Fichiers :**
- `reqy-web/components/test-runner-panel.tsx`
- `reqy-web/components/assertion-editor.tsx`
- `reqy-web/components/batch-run-progress.tsx`
- `reqy-web/lib/test-runner.ts`
- `reqy-web/lib/test-runner/` (helpers)

---

### 🎭 Mock Server

- **Création depuis une réponse** : un clic → génère un mock à partir d'une réponse existante
- **Routes mock** : CRUD complet (POST/GET/PUT/DELETE)
- **Pattern matching** : support des wildcards (`/api/users/*`)
- **Serveurs** : routage par préfixe (`/api/v1/*` → server 1)
- **Rate limiting par route** : configurable
- **Délais simulés** : pour tester la latence
- **Variantes de réponse** : rotation de plusieurs réponses par route
- **Logs** : 200 dernières requêtes servies (timestamp, path, status, durée)
- **Persistance** : localStorage (web) + backend Tauri (desktop)
- **Endpoints** :
  - `POST/GET /api/mock/config` : CRUD des routes
  - `ALL /api/mock/[...path]` : sert les mocks

**Fichiers :**
- `reqy-web/components/route-panel.tsx`
- `reqy-web/components/route-modal.tsx`
- `reqy-web/components/mock-route-editor.tsx`
- `reqy-web/lib/mock-store.ts`
- `reqy-web/lib/mock-resolver.ts`
- `reqy-web/lib/mock-events.ts`
- `reqy-web/lib/mock-types.ts`
- `reqy-web/app/api/mock/config/route.ts`
- `reqy-web/app/api/mock/[...path]/route.ts`

---

### 🔗 Chaining de requêtes

- **Extraction de variables** depuis une réponse précédente
- **Chemins JSON** : `data.user.id`, `headers.x-rate-limit`, `body[0].email`
- **Injection dans la requête suivante** : via `{{var}}`
- **UI de mapping** : dialog avec test de résolution
- **Validation des chemins** : pre-flight check avant exécution
- **⚠️ Limitation connue** : fragile sur réponses non-JSON

**Fichiers :**
- `reqy-web/components/request-chaining-dialog.tsx`
- `reqy-web/lib/variable-mapping.ts`
- `reqy-web/lib/variable-path.ts`

---

### 🔮 GraphQL

- **Builder visuel** : query/mutation/subscription
- **Variables** : éditeur key/value
- **Headers** : spécifiques GraphQL
- **Introspection schema** : automatique depuis l'endpoint
- **Mode builder** : toggle (active après introspection)
- **AI pour génération** :
  - `naturalLanguageToQuery` : description → query GraphQL
  - `fixQueryFromError` : corrige une query cassée
- **Format Reqly AI** : extraction correcte depuis wrapper JSON

**Fichiers :**
- `reqy-web/components/graphql/` (sous-dossier complet)
- `reqy-web/components/graphql/graphql-query-builder.tsx`
- `reqy-web/app/graphql/` (page dédiée)
- `reqy-web/hooks/use-graphql-ai.ts`
- `reqy-web/lib/graphql/` (utilitaires)

---

### 📂 Projets et Workspaces

#### Projets
- **CRUD projets** : nom, port, framework, git remote
- **Réécriture automatique** : `localhost:3000` → `localhost:{port_projet}`
- **Templates** : React, Vue, Next.js, Express, FastAPI, etc.

**Fichiers :** `reqy-web/components/project-card.tsx`, `reqy-web/app/my-projects/`

#### Workspaces
- **Multi-workspace** : personnel + équipes
- **Filtrage** : collections/environnements/historique par workspace
- **Sync inter-onglets** : via BroadcastChannel API
- **Invitations** : système de membres
- **Rôles** : owner, admin, member (futur)

**Fichiers :**
- `reqy-web/components/workspace-selector.tsx`
- `reqy-web/components/workspace-create-dialog.tsx`
- `reqy-web/components/workspace-invite-dialog.tsx`
- `reqy-web/components/workspace-join-dialog.tsx`
- `reqy-web/lib/workspace-utils.ts`
- `reqy-web/contexts/`

---

### ☁️ Sync Cloud bidirectionnel

- **Sync incrémental** : upload/download des deltas
- **Tracking device** : `last_sync_at` par device
- **Conflict resolution** : `sync-conflict-modal.tsx` pour résolution manuelle
- **Offline queue** : `lib/offline-queue.ts` — les actions offline sont mises en queue
- **Storage adapter** : abstraction localStorage / Tauri FS
- **Offline-first** : fonctionne sans réseau, sync au retour
- **Status indicator** : `sync-status.tsx` (synced/pending/syncing/error)
- **Server** : voir `sync-server/` (package séparé)

**Fichiers :**
- `reqy-web/components/sync-status.tsx`
- `reqy-web/components/sync-status-banner.tsx`
- `reqy-web/components/sync-conflict-modal.tsx`
- `reqy-web/components/sync-engine-initializer.tsx`
- `reqy-web/hooks/use-sync.ts`
- `reqy-web/lib/sync-client.ts`
- `reqy-web/lib/sync-schema.ts`
- `reqy-web/lib/sync-types.ts`
- `reqy-web/lib/sync-utils.ts`
- `reqy-web/lib/offline-queue.ts`
- `reqy-web/lib/storage-adapter.ts`
- `reqy-web/lib/secure-storage.ts`

---

### 🔐 Authentification

- **Email / mot de passe** : signup + login
- **OAuth GitHub** : via `/api/auth/github/*`
- **OAuth Google** : via `/api/auth/google/*`
- **Sessions signées HMAC-SHA256** : cookies 30 jours
- **Vérification d'état** : `/api/auth/me`
- **CSRF tokens** : protection contre les attaques CSRF
- **Logout** : invalidate session

**Fichiers :**
- `reqy-web/app/auth/` (pages login/signup)
- `reqy-web/app/api/auth/login/route.ts`
- `reqy-web/app/api/auth/signup/route.ts`
- `reqy-web/app/api/auth/logout/route.ts`
- `reqy-web/app/api/auth/me/route.ts`
- `reqy-web/app/api/auth/session.ts`
- `reqy-web/app/api/auth/github/`
- `reqy-web/app/api/auth/google/`
- `reqy-web/app/api/auth/callback/route.ts`

---

### 🐙 Intégration GitHub

- **OAuth dédié** : accès API GitHub (repos, gists, etc.)
- **Liste des repos** : récupération paginée
- **Import de code** :
  - Détection automatique du langage (10 langages)
  - Détection du framework (React, Vue, Next.js, Express, FastAPI, etc.)
  - Détection des ports
  - Détection des routes API
  - Génération automatique de collections Reqly
- **Analyseur AST** : `tree-sitter-parser.ts` pour 10 langages
  - JavaScript, TypeScript, Python, PHP, Go, Java, Ruby, C#, Kotlin, Swift, Rust
- **File panel** : exploration des fichiers du repo

**Fichiers :**
- `reqy-web/app/api/github-auth/`
- `reqy-web/app/api/github-import/route.ts`
- `reqy-web/components/git-panel.tsx`
- `reqy-web/components/import-github-modal.tsx`
- `reqy-web/lib/detect-shared.ts`
- `reqy-web/lib/tree-sitter-parser.ts`

---

### 📬 Intégration Postman

- **Import** : collections Postman v2.1.0
- **Export** : collections vers format Postman
- **⚠️ Partiel** : l'auth OAuth (`postman-auth/route.ts`) retourne stub `not configured`
- **Auth actuelle** : cookie API key côté client

**Fichiers :**
- `reqy-web/app/api/postman-import/route.ts`
- `reqy-web/app/api/postman-export/route.ts`
- `reqy-web/components/import-postman-modal.tsx`
- `reqy-web/components/export-postman-modal.tsx`

---

### 📥 Import / Export

- **JSON natif Reqly** : format propriétaire
- **OpenAPI 3.x** : import spec complète
- **Postman v2.1** : collections
- **GitHub** : repos
- **Merge intelligent** : `lib/import-merge/` — résolution de conflits
- **Roundtrip** : export → re-import sans perte

**Fichiers :**
- `reqy-web/components/import-export-modal.tsx`
- `reqy-web/components/import-openapi-modal.tsx`
- `reqy-web/components/export-postman-modal.tsx`
- `reqy-web/components/openapi-export-modal.tsx`
- `reqy-web/lib/import-schemas.ts`
- `reqy-web/lib/import-merge/`
- `reqy-web/lib/openapi-import.ts`
- `reqy-web/lib/openapi-export.ts`

---

### 📄 Export OpenAPI

- **Spec OpenAPI 3.0.3** complète
- **Chemins, paramètres, request bodies** inférés depuis collections
- **Schémas de réponse** : génériques (non inférés depuis historique)
- **Métadonnées** : titre, version, description

**Fichier :** `reqy-web/lib/openapi-export.ts`

---

### 💻 Génération de SDK

- **Génération automatique** de SDK dans plusieurs langages
- **Templates** : TypeScript, Python, Go, Java
- **Basé sur OpenAPI** : import spec → génère client typé

**Fichiers :**
- `reqy-web/components/sdk-download-button.tsx`
- `reqy-web/lib/sdk-codegen/`
- `reqy-web/app/sdks/`

---

### 📚 Documentation auto

- **Génération Markdown** depuis une collection
- **Sections auto** : Overview, Auth, Endpoints, Quick Start, Errors
- **Variables `{{var}}`** dans les exemples
- **Header safety** : `safeHeaders()` filtre Authorization, Cookie, etc.

**Fichiers :**
- `reqy-web/components/documentation/` (page dédiée)
- `reqy-web/src/ai/cloud-engine/docs-generator.ts`

---

### 📈 Dashboard Analytics

- **Métriques globales** : requêtes totales, temps moyen, taux de succès, endpoints actifs
- **Graphiques de volume** sur 7 jours (Recharts)
- **Top endpoints lents**
- **Santé des endpoints** : % succès, p95, distribution codes status
- **Refresh automatique**

**Fichiers :**
- `reqy-web/app/dashboard/page.tsx`
- `reqy-web/components/dashboard/charts-content.tsx`

---

### 🔍 Analyse proactive

- **Détection automatique** des anomalies :
  - Endpoints lents (moyenne 3 derniers runs ≥ 130% moyenne globale)
  - Taux d'erreur > 20%
  - Collections inutilisées depuis 7 jours
- **Alertes avec notifications**
- **Suivi des alertes ignorées**

**Fichier :** `reqy-web/lib/store-analysis.ts`

---

### 🔔 Notifications

- **Notifications in-app** avec historique
- **Toasts** (sonner)
- **Permission API** : demande pour notifications système navigateur
- **Marquage de lecture**
- **Compteur non-lues**

**Fichiers :**
- `reqy-web/lib/store/notifications.ts`
- `reqy-web/hooks/use-toast.ts`
- `reqy-web/components/ui/` (toaster)

---

### ⌨️ Raccourcis clavier

| Raccourci | Action |
|---|---|
| `Ctrl+Enter` | Envoyer la requête |
| `Ctrl+T` | Nouvel onglet |
| `Ctrl+W` | Fermer l'onglet courant |
| `Ctrl+S` | Sauvegarder dans collection |
| `Ctrl+/` | Formater le JSON |
| `Ctrl+K` | Recherche rapide |
| `Esc` | Fermer dialog / stopper stream |
| `Ctrl+Shift+A` | **AI : focus chat input** (Phase 7.5) |
| `Ctrl+Shift+F` | **AI : réappliquer dernier fix** (Phase 4) |

Les raccourcis sont **automatiquement ignorés dans les inputs** (sauf si `allowInInputs: true`).

**Fichiers :**
- `reqy-web/hooks/use-keyboard-shortcuts.ts`
- `reqy-web/hooks/use-global-shortcut.ts` (Phase 7.5 — générique)

---

### 🎨 Thèmes

- **7 thèmes** : light, dark, emerald, ocean, sunset, purple, midnight
- **Tailwind CSS v4** : variants automatiques
- **Theme provider** : `theme-provider.tsx`
- **Persistance localStorage**
- **Détection préférence système** au premier load
- **Switcher rapide** dans la sidebar

**Fichiers :**
- `reqy-web/components/theme-provider.tsx`
- `reqy-web/components/theme-switcher.tsx`

---

### 🧭 Sidebar / Navigation

- **Navigation entre pages** : Playground, Collections, Mocks, GraphQL, Dashboard, Settings, AI Insights, etc.
- **Collapsible** : état persisté
- **Workspace selector** intégré
- **Sync status indicator**
- **AI toggle**

**Fichiers :**
- `reqy-web/components/api-sidebar.tsx`
- `reqy-web/contexts/sidebar-context.tsx`

---

## 🤖 AI Copilot (ReqlyAI)

> Le moteur IA hybride ReqlyAI combine un **moteur local déterministe** (P95 < 50ms, zéro réseau) avec un **cloud LLM streaming** + **RAG sur ~3000 chunks** de specs HTTP.

### Phase 1 — Moteur local (déterministe)

> **But** : diagnostiquer 85% des erreurs courantes sans réseau.

- **Context Builder** : infère `authType` depuis headers, construit `RequestContext` typé
- **30+ règles déterministes** en 5 catégories :
  - **`auth.ts`** : 401/403 (bearer missing, expired, basic auth invalide)
  - **`format.ts`** : 415 (Unsupported Media Type), 400 (Bad Request), 422 (Validation), 413 (Payload too large), 404 (Not Found)
  - **`performance.ts`** : timeout, 429 (rate limit), body size exceeded
  - **`server.ts`** : 500, 502, 503, 504 (avec diagnostic de cascade)
  - **`ssl.ts`** : SSL certificate expired, network errors
- **Analyzer** : orchestrateur avec dedup + severity sort (error > warning > info)
- **Confidence scoring** : chaque diagnostic a un score 0-1
- **P95 latency** : < 50ms (validé par benchmark)
- **Dataset validation** : 200+ cas annotés

**Fichiers :**
- `reqy-web/src/ai/local-engine/analyzer.ts`
- `reqy-web/src/ai/local-engine/context.ts`
- `reqy-web/src/ai/local-engine/index.ts`
- `reqy-web/src/ai/local-engine/rules/auth.ts`
- `reqy-web/src/ai/local-engine/rules/format.ts`
- `reqy-web/src/ai/local-engine/rules/performance.ts`
- `reqy-web/src/ai/local-engine/rules/server.ts`
- `reqy-web/src/ai/local-engine/rules/ssl.ts`

### Phase 2 — Cloud LLM (streaming)

- **`streamLLM()`** : client SSE générique vers `/api/proxy-ai`
- **`/api/proxy-ai`** : route proxy multi-provider
- **Providers supportés** (7) :
  - OpenAI (compatible)
  - Anthropic (Claude)
  - OpenRouter
  - DeepSeek
  - Google Gemini
  - Ollama (local)
  - Opencode Zen
- **Streaming** : SSE pass-through pour OpenAI-compatibles, JSON fallback pour les autres
- **Annulation** : via `AbortSignal`
- **Chaîne de fallback** : OpenRouter → DeepSeek → Claude Haiku
- **ModeIndicator** : pill "local" vs "cloud" selon l'analyse utilisée
- **ChatPanel** : UI avec streaming live token-by-token

**Fichiers :**
- `reqy-web/src/ai/cloud-engine/llm.ts`
- `reqy-web/app/api/proxy-ai/route.ts`
- `reqy-web/src/ai/components/ChatPanel.tsx`
- `reqy-web/src/ai/components/ModeIndicator.tsx`

### Phase 3 — RAG (Retrieval-Augmented Generation)

> **But** : enrichir le contexte LLM avec ~3000 chunks de specs (RFC, MDN, OWASP, etc.)

#### Infrastructure
- **pgvector activé** dans Supabase
- **Table `knowledge_chunks`** : `(id, content, embedding vector(1024), source, metadata jsonb, chunk_index, created_at, tsv tsvector)`
- **RPC `match_knowledge_chunks(embedding, count, threshold, filter_source)`** : recherche cosine
- **Index IVFFlat** sur embedding (cosine)
- **Index GIN** sur tsvector (BM25 full-text)
- **Colonne `tsv`** : generated tsvector pour full-text search
- **RLS** : lecture pour `authenticated`, écriture `service_role`

#### Pipeline d'indexation
- **Chunking** : sliding-window 512 chars / overlap 64 (configurable)
- **Embedding** : Jina Embeddings v3 (1024-dim)
- **Batch upsert** : 500 rows/req vers Supabase
- **Mode clean** : réindexation depuis zéro
- **Sources** : 8 sources définies dans la spec
  - IANA Status Codes, RFC 9110, MDN HTTP, RFC 6749 OAuth, RFC 7519 JWT, GraphQL Spec, OWASP API Top 10, OpenAPI 3.1
- **Scripts CLI** : `scripts/index-knowledge-source.ts` (URL ou fichier)

#### Retrieval hybride
- **Vector search** : via RPC `match_knowledge_chunks`
- **BM25 full-text** : via PostgREST `textSearch` sur `tsv`
- **Fusion RRF** (Reciprocal Rank Fusion) avec poids configurables
- **Filtrage optionnel par source**
- **Top-K** : 5 par défaut
- **Score** : nombre entre 0 et 1 (plus haut = plus pertinent)
- **Citation tracking** : extraction dedup par source

#### Cache
- **`embedding-cache.ts`** : IndexedDB cache pour embeddings (SHA-256 keys)
- Évite de ré-embedder le même texte

#### Évaluation
- **Golden set** : 10 questions HTTP annotées (`src/ai/cloud-engine/__tests__/rag-golden-set.json`)
- **Métriques** : precision@5, MRR (Mean Reciprocal Rank)
- **Test live** : `rag-eval.test.ts` (skip si pas d'env Supabase)

**Fichiers :**
- `reqy-web/src/ai/cloud-engine/jina.ts` (client Jina)
- `reqy-web/src/ai/cloud-engine/reader.ts` (Jina Reader pour fetch HTML→MD)
- `reqy-web/src/ai/cloud-engine/index-pipeline.ts` (chunking + embed + upsert)
- `reqy-web/src/ai/cloud-engine/rag.ts` (retrieval hybride)
- `reqy-web/src/ai/cloud-engine/embedding-cache.ts` (cache IndexedDB)
- `reqy-web/src/ai/cloud-engine/prompt.ts` (modifié — accepte `retrievedChunks`)
- `reqy-web/supabase/migrations/20250626000001_*` (pgvector + RPC)

### Phase 4 — Fix auto UX

- **Double-clic protection** : 300ms cooldown
- **Undo 5s window** : toast avec bouton "Annuler"
- **Raccourci `Ctrl+Shift+F`** : réappliquer dernier fix
- **Toast confirmation** animé
- **Edge cases** : requête en vol, édition dirty, conflit

**Fichiers :**
- `reqy-web/components/diff-dialog.tsx`
- `reqy-web/components/diff-viewer.tsx`
- Modifications dans `components/response-panel.tsx`

### Phase 5 — Chat persistant

#### Migration
- **Table `chat_history`** : `(id, user_id, request_id, role, content, metadata, created_at)`
- **Index** : `(user_id, request_id, created_at desc)` pour queries principales

#### API REST
- **`GET /api/ai/chat/[requestId]`** : list messages
- **`POST /api/ai/chat/[requestId]`** : append (user ou assistant)
- **`DELETE /api/ai/chat/[requestId]`** : clear all (ou single via `?id=<msgId>`)

#### Hook React
- **`useChatHistory(requestId)`** :
  - `messages`, `loading`, `error`, `authenticated`
  - `append(role, content, metadata)`
  - `clear(id?)`
  - `refetch()`
- **`computeRequestId(method, url)`** : hash stable `METHOD::URL`
- **Auth-aware** : retourne empty si user non connecté

#### UI
- **ChatPanel** : merge historique persistant + streaming live
- **Header** : compteur de messages persistés
- **Bouton "Effacer"** : clear history du requestId courant
- **Raccourcis** :
  - `Enter` ou `Ctrl+Enter` → envoyer
  - `Esc` → stopper le stream
- **`reqly:focus-ai` event** : écoute pour focus AI depuis raccourci global

**Fichiers :**
- `reqy-web/supabase/migrations/20250626000002_*` (chat_history)
- `reqy-web/app/api/ai/chat/[requestId]/route.ts`
- `reqy-web/hooks/use-chat-history.ts`
- `reqy-web/src/ai/components/ChatPanel.tsx` (modifié)

### Phase 6 — Génération de requêtes

#### Refactor + extraction
- **`generate.ts`** : `buildNaturalLanguagePrompt(description, envVars)` extrait de `lib/ai-engine.ts`
- **Backward compatible** : `PROMPTS.naturalLanguageToRequest` délègue au nouveau module

#### Détection d'auth
- **`auth-detect.ts`** :
  - **Patterns URL** : GitHub, Stripe, OpenAI, Anthropic, Supabase, Twilio
  - **Hint keywords** : "OAuth2", "Basic auth", "Bearer", "API key"
  - **Headers templates** : par type d'auth (bearer/basic/apikey/oauth2)
  - **Confidence score** : 0-1
- **`headersForAuth(type)`** : standard headers pour chaque type
- **`applyAuthHeaders()`** : merge sans écraser l'existant

#### OpenAPI body generation
- **`openapi-sample.ts`** :
  - **Types primitifs** : string, number, integer, boolean
  - **Objects** : required + optional, nested
  - **Arrays** : min/max items
  - **`$ref`** : résolution via `rootSchemas`
  - **Composition** : `allOf` (merge), `anyOf` / `oneOf` (first valid branch)
  - **Formats** : email, uuid, date-time, uri, ipv4, hostname, byte
  - **Cap de récursion** (safety)
- **`generateBodyFromOpenApiRequest(schema, openApiSpec)`** : helper haut-niveau

#### Test suggestions
- **`test-suggestions.ts`** :
  - **Prompt builder** : catégories nominal/error/edge
  - **Schema JSON strict** en sortie
  - **`isValidSuggestion()`** : validation défensive

#### Documentation auto
- **`docs-generator.ts`** :
  - **`buildCollectionDocsPrompt(endpoints, options)`**
  - **Sections** : Overview, Authentication, Endpoints, Quick start, Error handling
  - **`safeHeaders()`** : filtre headers sensibles
  - **`isValidDocsOutput()`** : sanity check Markdown

#### Generate Dialog UI
- **`GenerateRequestDialog.tsx`** :
  - **Textarea** description
  - **Live preview** via `parseRequestDescription()`
  - **Méthode, URL, headers, body** affichés
  - **Bouton "Copier prompt LLM"** (clipboard API)
  - **Bouton "Appliquer"** : callback vers parent

#### Heuristic parser
- **`heuristic-parser.ts`** :
  - **Méthode** : regex + keywords (POST/PUT/PATCH/DELETE/GET)
  - **URL** : full ou path-only
  - **Headers** : Authorization, Content-Type, Accept, X-API-Key, Bearer
  - **Body** : extraction JSON + validation + normalisation espaces

#### Language detection
- **`language.ts`** :
  - **Stopwords FR/EN** : détection via fréquence
  - **Normalisation** : lowercase + strip accents (NFD)
  - **Seuil de confiance** : ≥2 stopwords + ratio ≥ 70%
  - **`adaptPromptForLanguage()`** : append directive au prompt

#### Citations
- **`citations.ts`** :
  - **`extractCitations(chunks)`** : dedup par source, sort by score, cap 5
  - **`prettyLabel()`** : `rfc-9110` → `RFC 9110`
  - **`groupCitationsByFamily()`** : par préfixe de source

#### Explain mode helpers
- **`explain.ts`** :
  - **`decodeJwt(token)`** : décode header.payload.signature + détection expiration
  - **`explainHeader(name, value)`** : description + warnings (X- prefix déprécié, Cookie > 4Ko, etc.)
  - **`annotateJson(value)`** : arbre typé récursif
  - **`summarizeAnnotated(node)`** : one-line summary `object{a:number,b:string}`

**Fichiers :**
- `reqy-web/src/ai/cloud-engine/generate.ts`
- `reqy-web/src/ai/cloud-engine/auth-detect.ts`
- `reqy-web/src/ai/cloud-engine/openapi-sample.ts`
- `reqy-web/src/ai/cloud-engine/test-suggestions.ts`
- `reqy-web/src/ai/cloud-engine/docs-generator.ts`
- `reqy-web/src/ai/cloud-engine/heuristic-parser.ts`
- `reqy-web/src/ai/cloud-engine/language.ts`
- `reqy-web/src/ai/cloud-engine/citations.ts`
- `reqy-web/src/ai/cloud-engine/explain.ts`
- `reqy-web/src/ai/components/GenerateRequestDialog.tsx`

### Phase 7 — Optimisation continue

#### Cache LRU des réponses
- **`response-cache.ts`** :
  - **IndexedDB** storage
  - **SHA-256** de la signature de requête
  - **Eviction LRU** quand > maxEntries (default 200)
  - **Promotion** sur lecture

#### Métriques P50/P95
- **`metrics.ts`** :
  - **Ring buffer** par label (capacity 1000)
  - **Percentiles** : P50, P95, P99
  - **Stats** : count, min, max, avg
  - **`timeAsync()`** : wrapper pour timing automatique

#### Feedback loop
- **`feedback-store.ts`** :
  - **localStorage** : ratings par diagnostic ID
  - **API** : `rateDiagnostic(id, rating)`, `getRating(id)`, `getRatingStats()`
  - **`RatingButtons`** : thumbs up/down dans `FixSuggestion.tsx`
  - **Toggle** : clic = clear

#### Raccourcis globaux
- **`use-global-shortcut.ts`** : hook générique
- **`AiShortcutBridge`** : dispatch `reqly:focus-ai` event
- **ChatPanel** écoute l'event → scroll + focus textarea
- **`Ctrl+Shift+A`** (Cmd+Shift+A Mac) → focus AI panel

#### Metrics dashboard widget
- **`MetricsWidget.tsx`** :
  - **Cards P50/P95** par label configurable
  - **Compteur feedback** 👍/👎 + ratio %
  - **Refresh** toutes les 5s
  - **Mode "no data"** si pas de samples

**Fichiers :**
- `reqy-web/src/ai/cloud-engine/response-cache.ts`
- `reqy-web/src/ai/cloud-engine/metrics.ts`
- `reqy-web/src/ai/cloud-engine/feedback-store.ts`
- `reqy-web/hooks/use-global-shortcut.ts`
- `reqy-web/components/ai-shortcut-bridge.tsx`
- `reqy-web/src/ai/components/RatingButtons.tsx`
- `reqy-web/src/ai/components/MetricsWidget.tsx`

---

## 🖥️ Desktop Tauri

- **Wrapper Rust natif** : `src-tauri/`
- **Fenêtres natives**
- **File system access** : `tauri.ts` bridge
- **Boîtes de dialogue natives** : file picker, save dialog
- **Mock server backend** : exécution native des routes mock
- **Stockage offline** : `lib/secure-storage.ts` via Tauri secure storage
- **Mock IPC** : `lib/tauri-mock.ts` pour dev web

**Commandes :**
```bash
pnpm tauri:dev      # Dev mode (compile Rust + lance Next.js)
pnpm tauri:build    # Build production desktop
```

**Fichiers :**
- `src-tauri/src/main.rs` (entry point Rust)
- `src-tauri/src/lib.rs`
- `src-tauri/tauri.conf.json` (config)
- `reqy-web/lib/tauri.ts`
- `reqy-web/lib/tauri-mock.ts`

---

## 📦 Packages additionnels

### `reqy-cli/` — CLI tool

- **CLI standalone** pour utiliser Reqly depuis le terminal
- Commandes : `reqly request`, `reqly collection`, etc.
- **Même logique métier** que la webapp, partagée via workspace pnpm

### `reqy-mcp/` — MCP Server

- **Model Context Protocol server** : expose les fonctionnalités Reqly aux LLMs externes
- Outils MCP pour Claude, Cursor, etc.
- Permet à un LLM externe de :
  - Lire/écrire des collections
  - Exécuter des requêtes
  - Accéder au diagnostic AI

### `sync-server/` — Backend de sync

- **API de sync cloud** (Cloudflare Worker ou Node.js)
- Endpoints : `/sync/push`, `/sync/pull`
- Authentification via token utilisateur
- Rate limiting par utilisateur
- Schema versioning

**Fichiers :** `sync-server/src/` (structure à explorer)

### `scripts/` — Automation

- **Scripts Node.js** pour automatiser les tâches
- Exemples : génération de docs, export de collections, etc.

---

## 🗄️ Base de données Supabase

### Tables (4)

| Table | Description | Lignes attendues |
|---|---|---|
| `sync_items` | Sync CRDT-like des collections | 100-1000/user |
| `sync_metadata` | Tracking device pour sync | 1/user |
| `knowledge_chunks` | Vector store RAG | ~3000 (après indexation) |
| `chat_history` | Historique chat par requête | variable |

### Schéma SQL complet

Voir `reqy-web/supabase/CONSOLIDATED_SCHEMA.sql` pour le script complet et idempotent.

### Fonctions RPC (1)

- **`public.match_knowledge_chunks(vector(1024), int, float, text)`** : recherche vectorielle cosine avec filtre source optionnel

### Row-Level Security (4 policies)

- Toutes les tables ont RLS activée
- Chaque user ne peut accéder qu'à ses propres données (sauf `knowledge_chunks` qui est globale en lecture)

---

## 🧪 Tests

### Stratégie

- **Tests unitaires** : Vitest (~230 tests verts)
- **Tests e2e** : Playwright (`reqy-web/tests/e2e/`)
- **Dataset validation** : pour le moteur IA local (200+ cas)
- **Benchmark P95** : local engine < 50ms

### Couverture

| Module | Tests |
|---|---|
| `src/ai/cloud-engine/` (RAG, AI, helpers) | ~199 tests |
| `hooks/` (chat history, shortcuts) | ~14 tests |
| `lib/` (mock resolver, parsing) | tests dédiés |
| Tests e2e | Playwright |

### Couverture IA

- Local engine rules : coverage par catégorie
- RAG retrieval : 10 questions golden set
- Chat history : hook testing avec Supabase mock
- Explain mode : JWT decode, header analysis, JSON annotation
- Generation : OpenAPI body, auth detection, heuristic parser, language detect
- Cache : LRU eviction, IndexedDB operations

**Lancer les tests :**
```bash
cd reqy-web
pnpm exec tsc --noEmit              # 0 erreur
pnpm exec vitest run src/ai/        # 199 tests
pnpm exec vitest run hooks/         # 14 tests
pnpm exec playwright test           # E2E
```

---

## 🚀 Build & Run

### Développement web

```bash
cd reqy-web
pnpm install
pnpm dev    # http://localhost:3000
```

### Développement desktop (Tauri)

```bash
pnpm tauri:dev    # Compile Rust + lance Next.js + ouvre fenêtre native
```

### Build production

```bash
# Web
cd reqy-web
pnpm build
pnpm start

# Desktop
pnpm tauri:build
```

### Tests

```bash
cd reqy-web
pnpm exec vitest run          # Tous les tests
pnpm exec vitest run src/ai/  # Tests AI seulement
pnpm exec playwright test     # E2E
```

### Apply DB schema

1. Ouvrir https://supabase.com/dashboard → SQL Editor
2. Copier-coller le contenu de `reqy-web/supabase/CONSOLIDATED_SCHEMA.sql`
3. Cliquer "Run"

---

## 📊 Statistiques globales

| Métrique | Valeur |
|---|---|
| Packages workspace | 4 (`reqy-web`, `reqy-cli`, `reqy-mcp`, `sync-server`) |
| Composants UI | ~80+ |
| Pages Next.js | ~15+ |
| API routes | ~30+ |
| Tables DB | 4 |
| Stores (zustand-like) | ~15+ |
| LLM providers supportés | 7 |
| Tests verts | ~230 |
| Langages AST parsés | 10 |
| Thèmes UI | 7 |
| Phases AI terminées | 7/7 (code complet, sauf items bloqués) |
| Commits totaux session | 12 |

---

## ⚠️ Items non livrés / bloqués

| Item | Raison |
|---|---|
| Phase 3.5-3.12 indexation réelle 8 sources RAG | Cache PostgREST schema stale côté infra |
| Phase 7.4 amélioration règles basée sur logs | Effort L (ML + infra logging) |
| Phase 7.7 auto-update base de règles via CDN | Pas de CDN configuré |
| 6.5 intégration `GenerateRequestDialog` dans toolbar | Composant existe, pas câblé |
| 6.6 UI Mode Explain F4 | Helpers existent, pas câblé |
| 5.7 citations dans `ChatPanel` | Helper existe, pas affiché |
| Postman OAuth (`postman-auth/route.ts`) | Stub "not configured" |

---

## 📚 Documentation complémentaire

- `reqy-web/MANUAL_ACTIONS.md` — Actions manuelles à faire
- `reqy-web/supabase/CONSOLIDATED_SCHEMA.sql` — Schéma SQL unique
- `docs/superpowers/specs/2026-06-25-reqlyai-copilot-design.md` — Spec complète
- `EXPLORER-GUIDE.md` — Guide d'exploration du code
- `TESTING-GUIDE.md` — Guide de test

---

**Dernière mise à jour :** Cette session a ajouté les modules AI Copilot (Phases 1-7), le chat persistant, le RAG retrieval hybride, et l'optimisation continue. Tous les modules non-AI étaient déjà en place avant cette session.
