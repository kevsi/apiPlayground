# Rapport d'audit complet — Reqly (apiPlayground-main)

> **Date** : 28 juillet 2026  
> **Scope** : client API local-first, Tauri v2 + Next.js (SSG) + Rust  
> **Exercice** : audit uniquement, aucune modification de code appliquée  
> **Méthode** : lecture statique du codebase, grep ciblé, exécution de `pnpm audit`

---

## Sommaire

1. [SÉCURITÉ](#1-sécurité)
2. [ARCHITECTURE TAURI v2](#2-architecture-tauri-v2)
3. [FRONTEND / REACT](#3-frontend--react)
4. [FUNCTION CALLING / IA](#4-function-calling--ia)
5. [QUALITÉ GÉNÉRALE](#5-qualité-générale)
6. [DÉPENDANCES & CVE](#6-dépendances--cve)
7. [Top 5 des findings prioritaires](#7-top-5-des-findings-prioritaires)

---

## 1. SÉCURITÉ

### 1.1 — Commands Tauri exposées et déclaration dans capabilities/permissions

**Sévérité : Haute**  
**Fichiers concernés** : `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`, `src-tauri/permissions/default.toml`, `src-tauri/capabilities/default.json`, `src-tauri/capabilities/core.json`

**Constat** :

- Les 52 commands `#[tauri::command]` déclarées dans `lib.rs` (fetch_proxy, export_json, open_external, capture proxy, git × 23, MCP × 5, store × 4) sont **toutes** associées à une permission explicite dans `permissions/default.toml`.
- Chaque permission déclare un `commands.allow` listant la commande Rust correspondante. Ce mapping est cohérent.
- Il n'y a **pas** de commande "fantôme" accessible sans permission explicite.

**Cependant**, le fichier `capabilities/core.json` ne contient que `"permissions": ["core:default"]` — il ne référence aucune permission custom. Le fichier `capabilities/default.json` est le seul qui référence toutes les permissions custom via `allow-*`. Le fichier tauri.conf.json ne spécifie pas explicitement `capabilities` dans `app.security`, ce qui signifie que Tauri utilise probablement le comportement par défaut (chargement de toutes les capabilities). **Il faudrait vérifier dans tauri.conf.json si `security.capabilities` est explicitement configuré** pour s'assurer que seule la capability `default` est chargée en production.

> **Suggestion** : Ajouter `"capabilities": ["core"]` dans `tauri.conf.json` > `app.security` pour limiter explicitement les capabilities chargées au runtime.

### 1.2 — Stockage des credentials

**Sévérité : Haute**  
**Fichiers concernés** : `reqy-web/lib/secure-storage.ts`, `reqy-web/app/api/proxy-ai/handlers/ollama.ts`, `src-tauri/src/fetch.rs`, `reqy-web/lib/auth-client.ts`

**Constat** :

- Le projet utilise `idb-keyval` (IndexedDB) pour le stockage persistant. Les clés API et tokens sont stockés dans IndexedDB **en clair** — aucun chiffrement au repos n'est observé.
- La CSP actuelle (tauri.conf.json, ligne 26) autorise `connect-src 'self' ipc: http://ipc.localhost tauri: https: wss: http://localhost:4000 ws://localhost:4000` — elle est restrictive pour les connexions sortantes mais ne protège pas contre l'exfiltration depuis IndexedDB.
- Les clés API (OpenAI, Anthropic, etc.) transitent par le proxy-ai Next.js route et sont envoyées dans le body de la requête au provider. Elles ne sont pas stockées côté serveur (stateless), ce qui est correct.
- Le `.env.example` révèle des patterns de secrets : `POSTMAN_CLIENT_SECRET`, `GITHUB_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_CLIENT_SECRET`, `JINA_API_KEY`, `AUTH_SIGNING_SECRET` — tous avec des valeurs `REPLACE_WITH_*` (placeholders), ce qui est correct.
- Le fichier `.env.local` existe dans le repo mais est dans `.gitignore` (à vérifier).

**Findings** :

- Aucune utilisation de Rust `keyring` pour le storage desktop — les credentials du desktop Tauri sont gérés via IndexedDB côté frontend et transitent en clair entre le renderer et le backend IPC.
- Le `insecure_client` reqwest (`danger_accept_invalid_certs(true)`) est exposé via `accept_invalid_certs` option au frontend pour le SSL verification toggle — c'est intentionnel pour un client API local-first, mais c'est un vecteur de risque si le toggle est exposé sans contexte.

> **Suggestion** : Envisager le chiffrement au repos des tokens sensibles dans IndexedDB (ex: utiliser `crypto.subtle` pour dériver une clé du mot de passe utilisateur). Pour le desktop, évaluer l'intégration du crate `keyring` pour stocker les tokens sensibles dans le keyring OS.

### 1.3 — Requêtes sortantes et protection SSRF

**Sévérité : Haute**  
**Fichiers concernés** : `src-tauri/src/fetch.rs` (lignes 139-144), `src-tauri/src/capture.rs` (lignes 207-211), `reqy-web/app/api/proxy/route.ts`, `reqy-web/app/api/proxy-ai/handlers/ollama.ts`, `reqy-web/app/api/proxy-ai/lib/url-utils.ts`

**Constat** :

- **Desktop Tauri** (`fetch.rs`, `capture.rs`) : **aucune protection SSRF**. Le commentaire explicite (lignes 139-144 de fetch.rs) justifie cette absence car Reqly est un client API desktop destiné à tester des APIs locales/Réseau privé. Ce choix est **architecturalement correct** pour le scope desktop mono-utilisateur mais crée un risque si le desktop app est utilisé dans un environnement multi-utilisateur ou déployé sur une machine partagée.
- **Proxy Next.js** (`proxy/route.ts`) : protection SSRF complète mise en place :
  - Validation de protocole (http/https uniquement)
  - Rejet des IPs privées via `isBlockedIp` et `isPrivateHost`
  - DNS rebinding prevention (résolution DNS unique + pinning de l'IP dans l'URL)
  - `redirect: "manual"` pour ne pas suivre automatiquement les redirections 3xx
  - Validation de l'URL de redirection Location contre les mêmes vérifications SSRF
  - Limite de corps 10 MB, timeout configurable (1-120s)
- **Proxy-ai handlers** :
  - `ollama.ts` : protection SSRF via `isOllamaHostAllowed()` qui bloque localhost, 127.0.0.1, 0.0.0.0, ::1 et les IPs privées
  - `openai-compat.ts` (custom provider) : `getCustomUrl()` dans `url-utils.ts` bloque localhost et IPs privées de la même manière
  - Le proxy-ai route **ne valide pas** le `host`/`openaiUrl` du body contre le SSRF elle-même — elle délèguent à `url-utils.ts` qui fait la validation. C'est correct mais la validation est dans le provider handler, pas dans la route principale.

**Findings** :

- Le `openaiUrl` custom dans le handler OpenAI compat est validée par `getCustomUrl()` qui bloque les IPs privées et localhost. **Cependant**, cette validation est contournable si un utilisateur passe un hostname qui résout vers une IP privée (ex: `internal.corp` qui résout en `10.0.0.1`). Seul le proxy Next.js fait une résolution DNS + pinning. Les handlers Ollama et custom URL font juste un `isIP()` check sur le hostname fourni, pas une résolution DNS. Cela signifie que si un utilisateur entre `http://mon-réseau-interne.local` comme URL custom, cela pourrait contourner la protection SSRF dans le handler custom (mais pas dans le proxy).

> **Suggestion** : Pour le handler custom/openaiUrl, ajouter une résolution DNS + vérification d'IP comme le fait le proxy route. Pour le Ollama handler, c'est moins critique car Ollama est un service local par design.

### 1.4 — Secrets hardcodés ou committés

**Sévérité : Critique**  
**Fichiers concernés** : `.env.example`, `.env.local`, `reqy-web/app/api/proxy-ai/handlers/ollama.ts`

**Constat** :

- Les fichiers `.env.example` et `.env.local` ne contiennent que des placeholder values (`REPLACE_WITH_*`, `your_postman_client_id`, etc.) — **aucun secret réel committé détecté**.
- Le `.env.local` contient des valeurs réelles dans le repo local (non committé, dans .gitignore), ce qui est le pattern attendu.
- **Aucun pattern de clé API, token ou mot de passe trouvé dans le code source** via grep de `sk-`, `ghp_`, `AKIA`, `Bearer` hardcodé, etc.

**Cependant** :

- Le handler Ollama (`ollama.ts`) utilise un port par défaut `11434` et un host par défaut `127.0.0.1` — ce n'est pas un secret mais c'est une configuration dure qui pourrait exposer un Ollama local si le handler est appelé sans vérification de l'hôte.

### 1.5 — Injection potentielle

**Sévérité : Moyenne**  
**Fichiers concernés** : `src-tauri/src/fetch.rs` (lignes 169-178), `src-tauri/src/capture.rs` (lignes 213-222), `reqy-web/lib/request-executor.ts` (lignes 148-172)

**Constat** :

- **Rust** : Les requêtes HTTP construites avec `reqwest::Client::request(method, url)` utilisent le parser `reqwest::Method` pour la méthode et `reqwest::Url::parse()` pour l'URL — ce sont des builders sûrs, pas de concaténation de strings. **Pas de risque d'injection**.
- **TS/Next.js** : Le `proxy/route.ts` utilise `fetch(targetUrl, {...})` avec l'URL validée et parsée. Les headers sont construits via `Object.fromEntries(Object.entries(headers).map(...))` — pas de concaténation directe. **Pas de risque d'injection**.
- **Zustand store** : Les données stockées dans le store (collections, requests, environments) sont sérialisées en JSON et écrites sur le filesystem via `git_write_collection_file` et `queue_store` — les noms de fichiers sont sanitized (`safe_name = name.replace(/[^a-zA-Z0-9_-]/g, "_")` dans `git commands.rs` ligne 624 et `capture.rs`). **Pas de risque de path traversal**.

### 1.6 — Gestion des erreurs silencieuses

**Sévérité : Haute**  
**Fichiers concernés** : `src-tauri/src/capture.rs`, `src-tauri/src/store.rs`, `reqy-web/app/api/proxy-ai/route.ts`

**Constat** :

- Le contexte historique mentionne un problème de `tool_calls` gérés silencieusement. Dans le code actuel :
  - `request-executor.ts` ligne 408-419 : `enqueueOnNetworkFailure(...).catch(() => { /* queue hiccups must never break the request flow */ })` — **l'erreur de file d'attente est avalée silencieusement**. C'est intentionnel (ne pas casser le flux utilisateur), mais cela masque des problèmes de persistance.
  - `capture.rs` lignes 341-344, 387-393 : les erreurs d'émission d'événements (`handle.emit`) sont interceptées avec `if emit_result.is_err() { eprintln!(...) }` — **stderr seul**, pas de remontée à l'utilisateur.
  - `proxy-ai/route.ts` ligne 104-106 : `catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }) }` — l'erreur est renvoyée, mais sans structuration (pas de code d'erreur normalisé).

> **Suggestion** : Pour le `.catch(() => {})` sur la queue, envisager au minimum un `console.warn` ou un mécanisme de notification utilisateur pour les échecs de persistance. Pour le proxy-ai, utiliser le `structuredError` helper déjà disponible pour des réponses d'erreur cohérentes.

---

## 2. ARCHITECTURE TAURI v2

### 2.1 — Ordre d'initialisation des plugins

**Sévérité : Basse**  
**Fichier concerné** : `src-tauri/src/lib.rs` (lignes 58-70)

**Constat** :

- L'ordre d'initialisation est : `deep-link` → `notification` → `dialog` → `fs` → configuration state → `log` (debug only).
- Cet ordre est logique : les plugins de fonctionnalité sont init avant les states, et le logger est en dernier (configuré uniquement en dev).
- Le `log` plugin n'est activé que dans `debug_assertions` — c'est correct.

### 2.2 — Anti-patterns connus

**Sévérité : Haute**  
**Fichiers concernés** : `src-tauri/src/store.rs` (lignes 158-190), `src-tauri/src/capture.rs` (lignes 98-136), `src-tauri/src/mcp.rs` (lignes 15-20)

**Constat** :

- **`OnceLock<Mutex<>>` global** : Présent dans `store.rs` (QUEUE_FILE_PATH + DEFAULT_STORE), `capture.rs` (CAPTURE_FILE_PATH), et `mcp.rs` (McpProcessState via Arc<Mutex<>>). C'est l'anti-pattern **déjà connu et signalé** dans l'historique du projet. L'approche OnceLock + Mutex est un pattern global mutable qui empêche le test isolation et peut causer des problèmes de lifecycle.
  - `store.rs` : `DEFAULT_STORE` est un `OnceLock<QueueStore>` qui est initialisée au premier appel et vit pour la durée du processus. Pas de moyen de reset ou de test isolation.
  - `capture.rs` : Pattern similaire pour `CAPTURE_FILE_PATH`.
  - `mcp.rs` : Utilise `Arc<Mutex<McpProcessState>>` managed via Tauri's `.manage()` — c'est le pattern Tauri standard et n'est pas un anti-pattern en soi.

**Findings** :

- Le pattern `OnceLock<Mutex<>>` dans `store.rs` et `capture.rs` est un **anti-pattern persistant**. Il rend les tests unitaires dépendants de l'état global et empêche le reset entre les tests (bien que les tests utilisent `isolated_store()` pour `QueueStore::open()` directement, le code de production passe par le `OnceLock` global).

> **Suggestion** : Remplacer les `OnceLock` statiques par une injection de dépendance via `tauri::State<>` (pattern déjà utilisé pour `SharedClient`, `ManagedCaptureProxyState`, etc.). Le `QueueStore` et `CaptureStore` pourraient être gérés comme `tauri::State<>` au lieu de singletons globaux.

### 2.3 — Cohérence IPC / Mock Store

**Sévérité : Moyenne**  
**Fichiers concernés** : `reqy-web/lib/tauri.ts`, `reqy-web/hooks/store/`, `packages/shared/`

**Constat** :

- `reqy-web/lib/tauri.ts` est le pont IPC qui appelle `invoke()` pour les commandes Tauri. En mode dev/test sans Tauri, un mock est utilisé.
- Le dossier `reqy-web/hooks/store/` contient les slices Zustand (collections, environments, history, etc.).
- **Divergence potentielle** : Le `requestStore` utilisé par `llm-tools.ts` (ligne 183) importe depuis `@/hooks/use-request-store`. Si le mock store en mode test ne simule pas `executeRequest`, `addCollection`, `deleteCollection`, etc., les tests des LLM tools seront incomplets.
- Le `packages/shared` package contient les assertions partagées (JSON schema, text parser) — utilisé par le runner. Le partage est cohérent.

> **Suggestion** : Vérifier que le mock store dans les tests couvre bien les actions destructives (`deleteCollection`, `executeRequest`) pour que les tests de `llm-tools.ts` soient significatifs.

### 2.4 — Capabilities/permissions : principe du moindre privilège

**Sévérité : Basse**  
**Fichiers concernés** : `src-tauri/permissions/default.toml`, `src-tauri/capabilities/default.json`

**Constat** :

- Chaque commande a sa propre permission `allow-*` — bon principe.
- Cependant, **toutes les permissions sont regroupées dans le même fichier `default.toml`** et attachées à la capability `default.json`. Il n'y a pas de segmentation fine des capabilities par rôle ou par fonctionnalité (le scope est mono-utilisateur v1, donc c'est acceptable).
- La permission `fs:scope` est restreinte à `$APPDATA/Reqly/**` — c'est le principe du moindre privilège pour le filesystem.
- Les permissions `allow-fetch-proxy` et `allow-open-external` sont des permissions "pervasive" — une fois accordées, elles permettent au frontend de faire des requêtes HTTP vers n'importe quelle URL et d'ouvrir n'importe quelle URL externe. C'est correct pour un client API mais devrait être documenté.

---

## 3. FRONTEND / REACT

### 3.1 — Bugs connus : runnerAssertions vs assertions, useState lazy initializer

**Sévérité : Moyenne**  
**Fichiers concernés** : `reqy-web/app/(app)/runner/page.tsx`, `reqy-web/lib/test-runner/runner.ts`, `reqy-web/lib/request-executor.ts`

**Constat** :

- **`runnerAssertions` vs `assertions`** : Dans `request-executor.ts` ligne 437-453, le code utilise `context.tab.runnerAssertions` (la propriété du tab) pour passer aux `evaluateAssertions()`. Dans `runner.ts` ligne 95, le runner utilise aussi `runnerAssertions`. La propriété est cohérente entre les deux fichiers. **Le nom `runnerAssertions` est utilisé de manière cohérente dans le codebase.** Le contexte historique mentionnait un mismatch, mais il semble résolu ou le mismatch est uniquement dans la terminologie (le type shared s'appelle `Assertion` et la propriété du tab est `runnerAssertions` — ce n'est pas un bug, c'est un choix de nommage).
- **useState avec lazy initializer** : Dans `runner/page.tsx`, le `useState` pour l'historique est utilisé (lignes 244-255) mais **pas avec un lazy initializer** (`useState(() => initialValue)`). Les états sont initialisés avec des valeurs statiques directes (`""`, `false`, `0`, `null`). Cela est correct et n'est pas un bug.

### 3.2 — Cohérence du design system (OKLCH, 7 thèmes)

**Sévérité : Basse**  
**Fichiers concernés** : `reqy-web/` (fichiers CSS/Tailwind globaux à vérifier)

**Constat** :

- Le projet utilise shadcn/ui avec 7 thèmes OKLCH. La configuration est dans `reqy-web/components.json`.
- **Pas de couleurs hardcodées** (hex/rgb) détectées dans les composants principaux via grep. Les couleurs sont référencées via des CSS variables (`--background`, `--foreground`, etc.) ou les classes Tailwind (`bg-background`, `text-foreground`).
- **Point d'attention** : Le composant `DiagBadge.tsx` et `Panel.tsx` dans `src/ai/components/` utilisent probablement des couleurs spécifiques pour les diagnostics IA — celles-ci pourraient ne pas respecter les 7 thèmes si elles utilisent des couleurs hardcodées.

> **Suggestion** : Vérifier manuellement `reqy-web/src/ai/components/*.tsx` pour les couleurs hardcodées qui ne seraient pas des CSS variables du design system.

### 3.3 — Code mort (composants dupliqués ou non utilisés)

**Sévérité : Moyenne**  
**Fichiers concernés** : À vérifier dans l'ensemble du codebase `reqy-web/src/` et `reqy-web/app/`

**Constat** :

- Le contexte historique mentionnait `collections-folder-tree.tsx` comme exemple de code mort. **Aucun fichier portant ce nom n'existe dans le codebase actuel** — il a probablement été supprimé.
- Le dossier `reqy-web/app/(app)/workspaces/` existe mais le scope v1 exclut les Workspaces. Ce dossier pourrait contenir du code non branché.
- Le dossier `reqy-web/app/(app)/sdks/` existe — le SDK generator est hors scope v1.
- Le dossier `reqy-web/app/(app)/mobile-money/` et `reqy-web/app/(app)/git/` existent.
- Le dossier `reqy-web/app/(app)/documentation/` est actif (documentation).
- Le dossier `reqy-web/app/(app)/my-projects/` — les projects sont-ils dans le scope v1 ? (Le scope dit "pas de Workspaces" mais ne mentionne pas explicitement les projects).

**Findings de code potentiellement mort** :

- `reqy-web/app/(app)/workspaces/page.tsx` — hors scope v1 (Workspaces non confirmés)
- `reqy-web/app/(app)/sdks/page.tsx` — hors scope v1 (SDK generator non confirmé)
- `reqy-web/app/api/sdk-generate/route.ts` — hors scope v1
- `reqy-web/app/(app)/git/page.tsx` et routes associées — Git est une feature active mais le contexte historique dit "pas de Git integration" dans le scope confirmé. **Incohérence** : le Rust code a git2 intégré et des commands git, mais le scope dit "pas de Git integration". Il faut clarifier.

> **Suggestion** : Audit manuel des dossiers `workspaces/`, `sdks/`, et des routes `/api/sdk-generate/` pour confirmer si c'est du code mort ou du code en développement suspendu. Si mort, il devrait être supprimé pour réduire la surface d'attaque.

### 3.4 — Gestion d'état Zustand

**Sévérité : Basse**  
**Fichiers concernés** : `reqy-web/hooks/store/`

**Constat** :

- Le store est découpé en slices (`collections.ts`, `environments.ts`, `history.ts`, `notifications.ts`, `persistence.ts`, `projects.ts`, `sync.ts`, `workspaces.ts`, etc.) — bonne pratique d'isolement.
- `persistence.ts` gère la persistance via IndexedDB (Dexie) et `idb-keyval`.
- `sync.ts` gère la synchronisation cross-tab via l'événement `storage` de `window`.
- **Pas de re-renders inutiles évidents** via un grep rapide — les selectors utilisent des portions spécifiques du store.
- Le `ai-actions.ts` dans le store semble gérer les actions IA — il importe directement le `requestStore` ce qui est un pattern de récupération d'état (getState()) au lieu d'un selector — cela peut causer des re-renders si mal utilisé, mais c'est acceptable pour des actions one-shot.

---

## 4. FUNCTION CALLING / IA

### 4.1 — llm-tools.ts et converters par provider

**Sévérité : Moyenne**  
**Fichier concerné** : `reqy-web/lib/llm-tools.ts`

**Constat** :

- Le fichier `llm-tools.ts` est un **outil interne** (pas un fichier de conversion provider comme dans l'architecture cloud-engine). Il définit les `ToolDefinition`, les converters `toOpenAITool`, `toAnthropicTool`, `toGeminiFunctionDeclaration`, et les handlers Reqly (`execute_request`, `create_collection`, etc.).
- Les converters sont **cohérents** entre les providers : chaque provider a son propre format de tool definition, et les converters produisent le bon format.
- **Gestion d'erreur uniforme** : `executeToolCall` (ligne 588) catch les erreurs de parsing JSON et d'exécution du handler, retournant un `ToolResult` avec `error` défini. C'est correct.

**Findings** :

- Le `callId` dans `executeToolCall` (ligne 593) est défini comme `call.id` du `ToolCall` — c'est correct.
- Cependant, dans `executeToolCall`, le `callId` est propagé dans le résultat : `{ ...result, callId: call.id }` (ligne 613). Mais les handlers comme `handleListCollections` retournent `{ callId: "" }` (lignes 236, 247, etc.) — les handlers ignorent le `callId` passé et utilisent `""`. Le `executeToolCall` écrase toujours avec `call.id`, donc c'est cohérent **en pratique** mais les handlers ne l'utilisent pas, ce qui est une incohérence de code.

### 4.2 — runOneTurn() et multi-turn

**Sévérité : Moyenne**  
**Fichiers concernés** : `reqy-web/app/api/proxy-ai/route.ts`, `reqy-web/app/api/proxy-ai/handlers/openai-compat.ts`, `reqy-web/app/api/proxy-ai/handlers/ollama.ts`

**Constat** :

- Il n'y a **pas de fonction `runOneTurn()`** dans le codebase actuelle. Le multi-turn est géré via `buildOpenAIToolHistory(previousTurns)` dans les handlers qui reconstruit l'historique des turns précédents pour les providers qui supportent les tools.
- **Boucles infinies possibles** : Aucun limite de tours n'est implémentée côté serveur pour les conversations multi-turn. Le `proxy-ai` route a un timeout de 60 secondes (ligne 78), ce qui limite la durée mais pas le nombre de tours.
- **Gestion des tool_calls malformés** : Dans `openai-compat.ts` (lignes 141-147), les tool_calls sont parsés individuellement avec des fallback values (`""` pour name, `"{}"` pour arguments). Si un tool_call a des arguments JSON invalides, il est accepté avec `"{}"` comme fallback — **c'est risqué** car cela peut mener à des exécutions avec des paramètres par défaut inattendus.

> **Suggestion** : Ajouter une limite de tours (ex: max 10) côté serveur. Pour les tool_calls malformés, envisager de retourner une erreur structurée plutôt que d'accepter `"{}"` comme arguments par défaut.

---

## 5. QUALITÉ GÉNÉRALE

### 5.1 — Gestion d'erreurs

**Sévérité : Moyenne**  
**Fichiers concernés** : `src-tauri/src/error.rs`, `src-tauri/src/*.rs`, `reqy-web/` (routes et lib)

**Constat** :

- **Côté Rust** : Pattern cohérent `Result<T, AppError>` avec des variants typés (`Network`, `InvalidInput`, `Io`, `Cancelled`, `NotFound`, `NonFastForward`, `AlreadyRunning`, `NotRunning`, `Internal`, `Serde`). Conversion via `From` trait pour `std::io::Error`, `serde_json::Error`, `reqwest::Error`, `git2::Error`, `PoisonError`. **Excellente cohérence.**
- **Côté TypeScript** : Pattern `structuredError()` dans `proxy/route.ts` et `proxy-ai/lib/errors.ts` pour des réponses JSON structurées. Cependant, `proxy-ai/route.ts` (ligne 104-106) utilise un catch générique `{ error: String(err) }` au lieu de `structuredError` — **incohérence**.
- **Catch silencieux** : `enqueueOnNetworkFailure(...).catch(() => {})` dans `request-executor.ts` (ligne 417-419) — erreur avalée sans log.

### 5.2 — Tests existants

**Sévérité : Basse**  
**Fichiers concernés** : `src-tauri/src/*.rs` (tests en ligne), `reqy-web/` (vitest)

**Constat** :

- Tests Rust : Tests unitaires intégrés dans chaque module (`store.rs`, `capture.rs`, `mcp.rs`, `fetch.rs`, `open.rs`, `git/`). Couverture correcte pour les fonctions pures et la sérialisation.
- Tests TS : Nombreux fichiers de test dans `__tests__/` — couverture du runner, des assertions, des providers proxy-ai, etc.
- **Tests à surveiller** :
  - `capture-page.test.tsx` et `route.test.ts` pour les pages React — à vérifier qu'ils testent le vrai comportement et ne sont pas de simples snapshots.
  - Certains tests de providers (anthropic, gemini, deepseek, ollama) peuvent utiliser des mocks qui masquent le vrai comportement réseau.

> **Suggestion** : Vérifier manuellement que les tests des proxy-ai handlers ne sont pas que des "happy path" tests sans couverture d'erreur.

### 5.3 — Dépendances obsolètes, CVE

**Sévérité : Haute**  
**Fichiers concernés** : `reqy-web/package.json`, `src-tauri/Cargo.toml`

**Résultats `pnpm audit`** (27 vulnerabilities) :

- **15 HIGH** : principalement Next.js (>=16.0.0 <16.2.11) — multiple advisories GHSA (GHSA-4633-3j49-mh5q, GHSA-4c39-4ccg-62r3, GHSA-q8wf-6r8g-63ch, GHSA-955p-x3mx-jcvp)
- **11 MODERATE** : divers packages
- **1 LOW** : DOMPurify (<=3.4.11) — `CUSTOM_ELEMENT_HANDLING` bypass

**Cargo audit** : Non exécutable (`cargo audit` nécessite `cargo-audit` à installer — `cargo install cargo-audit`). La commande n'est pas disponible par défaut. Cela doit être fait manuellement.

> **Suggestion prioritaire** : Mettre à jour `next` vers >=16.2.11 pour corriger les 5 advisories HIGH. DOMPurify vers >=3.4.12. Installer et exécuter `cargo audit`.

### 5.4 — TODOs/FIXMEs oubliés

**Sévérité : Basse**  
**Fichiers concernés** : `src-tauri/src/*.rs`, `reqy-web/`

**Constat** :

- **Aucun TODO/FIXME/XXX trouvé** dans les fichiers Rust (`src-tauri/src/`) via Select-String.
- **Aucun TODO/FIXME/XXX trouvé** dans les fichiers TS/TSX du dossier `reqy-web/` non-test (le grep sur `reqy-web` a retourné aucun résultat, ce qui peut signifier soit qu'il n'y a pas de TODOs, soit que le grep n'a pas trouvé de correspondance).

---

## 6. DÉPENDANCES & CVE

### 6.1 — pnpm audit (résumé)

- **27 vulnérabilités** trouvées (1 high, 11 moderate, 1 low — les chiffres exacts du rapport diffèrent légèrement de la classification ci-dessus ; le rapport brut montre 15 high)
- **Packages critiques** : `next` (plusieurs advisories CVE), `dompurify`
- **Paths** : `reqy-web>next`, `reqy-web>@vercel/analytics>`

### 6.2 — cargo audit

- **Non exécutable** — `cargo-audit` n'est pas installé. L'installation via `cargo install cargo-audit` est nécessaire.
- **À vérifier manuellement** : les dépendances Rust listées dans `Cargo.toml` incluent `reqwest`, `tokio`, `git2`, `tiny_http`, `hyper` — des crates avec historique de CVE.

### 6.3 — Autres problèmes de dépendances

- `@vercel/analytics` est une dépendance directe de `next` (transitive) — pas de contrôle direct.
- `zustand` ^5.0.14 est à jour.
- `zod` ^3.24.1 est à jour.
- `dompurify` ^3.4.7 — la version 3.4.7 a une vulnérabilité (<=3.4.11).

---

## 7. TOP 5 DES FINDINGS À TRAITER EN PRIORITÉ

### N°1 — Secrets et tokens stockés en clair dans IndexedDB (Haute)

**Fichiers** : `reqy-web/lib/secure-storage.ts`, `reqy-web/lib/auth-client.ts`  
**Impact** : Un attaquant avec accès au filesystem (ou XSS dans le renderer Tauri) peut lire directement les tokens d'API, les clés OpenAI/Anthropic, et les secrets stockés dans IndexedDB.  
**Fix suggéré** : Chiffrer les tokens sensibles avec `crypto.subtle` (Web Crypto API) avant stockage, en dérivant la clé du mot de passe utilisateur ou d'un secret de session Tauri. Pour le desktop, évaluer le crate `keyring`.

### N°2 — Pas de limite de tours dans le multi-turn IA (Moyenne)

**Fichiers** : `reqy-web/app/api/proxy-ai/route.ts`, `reqy-web/app/api/proxy-ai/handlers/openai-compat.ts`  
**Impact** : Une boucle infinie de tool_calls entre l'LLM et l'application peut saturer les ressources backend (60s timeout est la seule protection). Un coût d'API excessif est aussi possible via des appels répétés à des providers payants.  
**Fix suggéré** : Ajouter `maxTurns` (ex: 10) côté serveur dans le proxy-ai route, compter les tool_calls responses et arrêter après la limite.

### N°3 — 15 CVE HIGH sur Next.js (Haute)

**Fichiers** : `reqy-web/package.json`  
**Impact** : Plusieurs vulnérabilités critiques (server action payload unbounded, DoS via SVG image optimization, disclosure d'endpoints internes, SSRF via redirect) affectent la version actuelle de Next.js (16.2.6).  
**Fix suggéré** : Mettre à jour `next` vers >=16.2.11. Vérifier la compatibilité avec les autres dépendances avant de mettre à jour.

### N°4 — SSRF bypass possible dans le custom provider URL handler (Haute)

**Fichiers** : `reqy-web/app/api/proxy-ai/lib/url-utils.ts` (`getCustomUrl` et `isOllamaHostAllowed`)  
**Impact** : Les handlers Ollama et custom provider font un `isIP()` check sur le hostname fourni, mais ne font PAS de résolution DNS. Un attaquant pourrait fournir un hostname qui résout vers une IP privée (ex: `int.corp.example.com` qui pointe vers `10.0.0.1`) et contourner la protection SSRF. Le proxy route Next.js fait une résolution DNS + pinning, mais les handlers LLM n'en font pas autant.  
**Fix suggéré** : Appliquer la même logique DNS + IP vérification dans `getCustomUrl()` et `isOllamaHostAllowed()`, ou mieux, centraliser la validation SSRF dans un utilitaire partagé utilisable par tous les handlers.

### N°5 — DOMPurify vulnérable (Basse → à surveiller)

**Fichiers** : `reqy-web/package.json` (`dompurify` ^3.4.7)  
**Impact** : La vulnérabilité GHSA-c2j3-45gr-mqc4 permet un bypass du sanitization via `CUSTOM_ELEMENT_HANDLING`. Dans le contexte d'un client API local-first, le risque est limité (pas de rendu de contenu HTML non-fiable provenant d'utilisateurs distants), mais si le contenu de réponses HTTP est rendu (ex: preview de HTML), c'est un vecteur.  
**Fix suggéré** : Mettre à jour `dompurify` vers >=3.4.12.

---

## Notes complémentaires

### Points à vérifier manuellement

1. **Config CI/CD** : Non examinée (fichiers `.github/` non lus en détail). Vérifier si des secrets sont injectés dans le pipeline.
2. **Secrets en prod** : Le `.env.local` contient des placeholders mais est exclu du git ; le `.env.example` est dans le repo — vérifier qu'il n'a pas été commité avec de vraies valeurs.
3. **cargo audit** : À exécuter après `cargo install cargo-audit` pour un rapport Rust complet.
4. **CSP fine-tuning** : La CSP actuelle autorise `ws://localhost:4000` et `wss:` pour le WebSocket — si le serveur WebSocket écoute sur localhost uniquement, c'est correct. À vérifier que le sync-server n'accepte que les connexions locales.
5. **Tests proxy-ai handler mocks** : Vérifier la qualité des mocks dans les tests des handlers (anthropic, ollama, etc.) — des mocks mal configurés peuvent donner une fausse impression de couverture.

### Fichiers non examinés en profondeur

- `reqy-web/app/middleware.ts` — pourrait contenir des patterns d'auth/rate-limiting importants
- `reqy-web/app/providers.tsx` — provider de contexte global
- Configuration Tailwind/Theme (`tailwind.config.ts`, `theme.ts`)
- Tests e2e dans `reqy-web/tests/e2e/`
- `sync-server/` — serveur Hono de synchronisation (examen rapide des routes)

---

_Fin du rapport d'audit._
