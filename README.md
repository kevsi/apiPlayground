# Reqly

Application web et desktop de test d'API, d'inspection de réponses et de gestion de collections. Basée sur **Next.js** (React 19) avec un backend **Tauri** (Rust) pour la version desktop.

---

## Analyse des fonctionnalités

### ✅ 1. Éditeur de requêtes HTTP
Onglets multiples, barre d'adresse, sélecteur de méthode (GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS), éditeur de headers, query params, body (json / form-data / x-www-form-urlencoded / raw / binary), authentification (Bearer / Basic / API Key / OAuth 2.0).
- **Fichiers clés :** `request-panel.tsx`, `request-tabs-manager.tsx`, `request-tab-bar.tsx`
- **État : Complet**

### ✅ 2. Proxy API anti-CORS
Envoi des requêtes HTTP côté serveur Next.js avec timeout configurable, limitation de taille (10 Mo requête, 5 Mo réponse), protection SSRF (IP privées + DNS rebinding), rate limiting (100 requêtes/min).
- **Fichier clé :** `app/api/proxy/route.ts`
- **État : Complet**

### ✅ 3. Panneau de réponse
Affichage du statut, durée, taille. Headers. Rendu du corps (JSON formaté, HTML, images, raw). Génération de snippets de code (fetch, curl, XMLHttpRequest).
- **Fichiers :** `response-panel.tsx`, `response-content-renderer.tsx`, `response-code-snippet.tsx`
- **État : Complet**

### ✅ 4. Historique
Stockage en localStorage. Rejeu de requêtes. Nettoyage individuel ou complet.
- **Fichiers :** `history-panel.tsx`, `store/history.ts`
- **État : Complet**

### ✅ 5. Collections
CRUD de collections et dossiers (arborescence), ajout/suppression/réordonnancement de requêtes, vue liste/cartes, recherche, filtrage par méthode, glisser-déposer, déplacement vers dossier.
- **Fichiers :** `collections-panel.tsx`, `collections-folder-tree.tsx`
- **État : Complet**

### ✅ 6. Collections → Éditeur (intégration)
Pont SPA via variable module (`request-bridge.ts`) : chargement d'une requête depuis `/collections` vers `/` avec création d'un nouvel onglet. Utilise `openRequestInTab` avec déduplication (`savedRequestId`). Fonctionne aussi via le tiroir latéral dans l'éditeur.
- **Fichiers :** `request-bridge.ts`, `use-request-tab-execution.ts` (l. 268-293, 406-434)
- **État : Complet** (le README précédent était obsolète)

### ✅ 7. Tableau de bord (analytics)
Métriques : requêtes totales, temps moyen, taux de succès, endpoints actifs. Graphiques de volume sur 7 jours. Endpoints les plus lents. Santé des endpoints.
- **Fichiers :** `app/dashboard/page.tsx`, `dashboard/charts-content.tsx`
- **État : Complet**

### ✅ 8. Analyse proactive
Détection automatique : endpoints lents (moyenne des 3 dernières ≥ 130 % de la moyenne globale), taux d'erreur > 20 %, collections inutilisées depuis 7 jours. Alertes avec suivi des notifications ignorées.
- **Fichier :** `store-analysis.ts`
- **État : Complet**

### ✅ 9. Serveur de mocks
Routes mock CRUD avec pattern matching, serveurs (routage par préfixe), rate limiting par route, délais simulés, variantes de réponse, logs (200 entrées), génération automatique depuis les collections. Persistance localStorage + backend Tauri.
- **Fichiers :** `use-mock-store.ts`, `lib/mock-resolver.ts`, `app/api/mock/config/route.ts`, `app/api/mock/[...path]/route.ts`
- **État : Complet**

### ✅ 10. Environnements
Variables clé-valeur par environnement, interpolation `{{variable}}` dans les URLs/headers/corps, sélection d'environnement actif.
- **Fichiers :** `store/environments.ts`, `environment-selector.tsx`
- **État : Complet**

### ✅ 11. Chaining de requêtes (variables)
Extraction de valeurs depuis les réponses précédentes (chemin JSON) et injection comme variables dans les requêtes suivantes. Interface de mapping avec test de résolution.
- **Fichiers :** `lib/variable-mapping.ts`, `lib/variable-path.ts`, `request-chaining-dialog.tsx`
- **État : Complet mais fragile** — échoue sur réponses non-JSON, pas de validation avancée des chemins

### ✅ 12. Assistant IA
Chat IA complet. Support de : OpenAI, Anthropic (Claude), Google Gemini, OpenRouter, Ollama, DeepSeek. Analyse de réponse, génération de tests (Jest/fetch/curl), conversion langage naturel → requête, génération de documentation. Contexte adapté à la page courante.
- **Fichiers :** `use-ai-engine.ts`, `use-ai-context.ts`, `floating-ai-chat.tsx`, `app/api/proxy-ai/route.ts`, `lib/ai-engine.ts`
- **État : Complet**

### ✅ 13. Authentification (Supabase)
Email/mot de passe (inscription + connexion), OAuth GitHub, OAuth Google. Sessions signées HMAC-SHA256 (30 jours) stockées en cookie. Vérification d'état. Gestion des tokens sans base de données.
- **Fichiers :** `app/api/auth/*`, `app/api/auth/session.ts`
- **État : Complet**

### ✅ 14. Intégration GitHub
OAuth dédié (accès API GitHub), récupération des repositories, import de code avec détection de langage/framework/ports/routes (JS, Python, PHP, Go, Java, Ruby, C#, Kotlin, Swift, Rust). Analyseur de code arbre (tree-sitter) pour 10 langages.
- **Fichiers :** `app/api/github-auth/*`, `app/api/github-import/route.ts`, `lib/detect-shared.ts`
- **État : Complet**

### ⚠️ 15. Intégration Postman
Récupération des collections, import par ID, export format Postman v2.1.0. Mais le point d'entrée OAuth (`postman-auth/route.ts`) est une **ébauche non implémentée** qui retourne systématiquement `{ authenticated: false }`. L'authentification se fait côté client via cookie API key.
- **Fichiers :** `app/api/postman-auth/*`, `app/api/postman-import/route.ts`, `app/api/postman-export/route.ts`
- **État : Partiel** — la route d'auth OAuth est un stub

### ✅ 16. Export OpenAPI 3.0
Génération de spécification OpenAPI 3.0.3 depuis les collections. Chemins, paramètres, corps de requête inférés.
- **Fichier :** `lib/openapi-export.ts`
- **État : Complet** (schémas de réponse génériques, non inférés de l'historique)

### ✅ 17. Import/Export
Export/import JSON de collections. Import OpenAPI. Import/export Postman.
- **Fichiers :** `import-export-modal.tsx`, `import-openapi-modal.tsx`
- **État : Complet**

### ✅ 18. Projets
CRUD de projets de développement avec port. Réécriture automatique de localhost pour les URLs des requêtes.
- **Fichiers :** `store/projects.ts`, `app/my-projects/page.tsx`
- **État : Complet**

### ✅ 19. Espaces de travail (workspaces)
Multi-workspaces (personnel + équipes). Filtrage des collections/environnements/historique par workspace. Synchronisation inter-onglets via BroadcastChannel.
- **Fichiers :** `store/workspaces.ts`, `workspace-selector.tsx`
- **État : Complet**

### ✅ 20. Notifications
Notifications in-app avec historique. Toasts. Demande de permission pour notifications système navigateur. Marquage de lecture.
- **Fichiers :** `store/notifications.ts`, `use-toast.ts`
- **État : Complet**

### ✅ 21. Raccourcis clavier
Envoi (Ctrl+Enter), nouvel onglet (Ctrl+T), fermeture (Ctrl+W), bascule sidebar/collections/historique, sauvegarde, recherche, formatage JSON. Ignorés automatiquement dans les champs de saisie.
- **Fichier :** `use-keyboard-shortcuts.ts`
- **État : Complet**

### ✅ 22. Thème clair/sombre
Basculateur, provider, Tailwind CSS v4.
- **Fichiers :** `theme-provider.tsx`, `theme-switcher.tsx`
- **État : Complet**

### ✅ 23. Barre latérale de navigation
Navigation entre toutes les pages, état repliable.
- **Fichiers :** `api-sidebar.tsx`, `sidebar-context.tsx`
- **État : Complet**

### ✅ 24. Version desktop (Tauri)
Fenêtres natives, boîtes de dialogue de fichiers, système de fichiers natif, exécution de requêtes natives, backend Rust pour les mocks.
- **Fichiers :** `src-tauri/`
- **État : Complet**

---

## Problèmes identifiés

| Problème | Fichier | Sévérité |
|---|---|---|
| `postman-auth/route.ts` retourne stub "not configured" | `app/api/postman-auth/route.ts` | Moyenne |
| Chargement IA : `use-ai-engine.ts` utilise `@/lib/projects-store` alors que `ai-config.ts` utilise `@/lib/config` | `use-ai-engine.ts` | Faible |
| Type-safety : `unknown as AIRequestStore` avec méthodes potentiellement absentes (`patchRequest`, `setVariable`, `setDoc`) | `use-ai-engine.ts` | Faible |
| Stale closure : `closeTab` lit `tabs` depuis la closure sans dépendance | `use-request-tabs-state.ts` | Faible |
| Provider detection bug : le callback OAuth utilise par défaut `"google"` au lieu de détecter depuis l'URL | `app/api/auth/callback/route.ts` | Faible |
| Cookie GitHub OAuth `secure: true` hardcodé (casse sur HTTP local) | `app/api/github-auth/route.ts` | Faible |
| Route d'API importée comme module utilitaire (`app/api/mock/config/route`) | `app/api/mock/[...path]/route.ts` | Faible |
| Endpoint debug mock expose l'état interne (routes, serveurs, config workspace) | `app/api/mock/[...path]/route.ts` | Faible (sécurité) |
| Extraction de variables fragile : échoue sur réponses non-JSON, chemins invalides non validés | `lib/variable-mapping.ts` | Moyenne |
| Export OpenAPI : schémas de réponse génériques, non basés sur l'historique | `lib/openapi-export.ts` | Faible |
| Store `executeRequest` : `bodyType: "json"` et `authType: "none"` en dur | `store/history.ts` | Faible |
| Pas de synchronisation cloud / partage multi-utilisateur | — | Élevée (manquant) |
| Pas de résolution de conflits lors du merge d'import/export | — | Moyenne |
| Code dupliqué : `buildGithubHeaders` défini dans deux routes | `github-auth/repos/route.ts` et `status/route.ts` | Faible |

---

## Stack technique

- **Frontend :** React 19, Next.js 16, TypeScript 5.7
- **UI :** Tailwind CSS v4, Radix UI (50+ composants), Lucide React, Recharts
- **Backend (web) :** Next.js API routes (App Router)
- **Desktop :** Tauri (Rust)
- **Auth :** Supabase (email + OAuth GitHub/Google), sessions signées HMAC-SHA256
- **Parsing :** web-tree-sitter (10 langages)
- **IA :** OpenAI / Anthropic / Gemini / Ollama / OpenRouter / DeepSeek
- **Tests :** Vitest, Playwright
