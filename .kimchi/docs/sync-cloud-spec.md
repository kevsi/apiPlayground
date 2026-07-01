# Spec : Synchronisation Cloud (Reqly)

## Contexte
Reqly utilise actuellement **IndexedDB + localStorage** pour la persistance locale. L'auth est gérée par **Supabase** (email + OAuth). Il n'y a **aucune synchronisation inter-appareils** ni **partage multi-utilisateur**.

## Objectif
Permettre la synchronisation bidirectionnelle des données utilisateur (collections, environnements, historique, variable mappings, projets, mocks) entre appareils via Supabase Database, avec gestion offline et résolution de conflits.

---

## Architecture

### Backend (Supabase)

| Table | Colonnes clés | Description |
|-------|---------------|-------------|
| `sync_items` | `id`, `user_id`, `workspace_id`, `item_type`, `item_id`, `payload` (JSONB), `updated_at`, `deleted` | Stockage générique CRDT-like de tous les items |
| `sync_metadata` | `user_id`, `workspace_id`, `last_sync_at`, `device_id` | Métadonnées de sync par device |

**RLS** : `auth.uid() = user_id` sur toutes les tables.

**Indexes** : `(user_id, workspace_id, item_type, updated_at)` pour les requêtes de sync.

### Stratégie de sync

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   Client A      │  ←────→ │  Supabase DB    │  ←────→ │   Client B      │
│  (IndexedDB)    │  push   │  (sync_items)   │  pull   │  (IndexedDB)    │
└─────────────────┘         └─────────────────┘         └─────────────────┘
```

1. **Push** : À chaque modification locale → upsert `sync_items` avec `updated_at = now()`
2. **Pull** : Toutes les 30s + au focus de la fenêtre → fetch items où `updated_at > last_sync_at`
3. **Merge côté client** : `last-write-wins` basé sur `updated_at`
4. **Offline** : Queue locale dans IndexedDB (`pending_sync`), flush au reconnect

### Résolution de conflits

- **Même item, même timestamp** : hasard basé sur `device_id`
- **Collections** : merge des requêtes (union des IDs, pas de suppression automatique)
- **Environnements** : merge des variables (dernier `updated_at` par variable)
- **Historique** : append-only (pas de conflit)
- **Mocks** : dernier qui écrit gagne (overwrite)

### API Routes nécessaires

1. `POST /api/sync/push` — envoie un batch de modifications
2. `GET /api/sync/pull?since=` — récupère les modifications depuis un timestamp
3. `POST /api/sync/resolve` — résolution manuelle d'un conflit

### Hooks/composants nécessaires

1. `hooks/use-sync.ts` — hook de sync automatique (pull toutes les 30s, push diff)
2. `components/sync-status.tsx` — indicateur visuel (en sync, en cours, conflit, offline)
3. `components/sync-conflict-modal.tsx` — UI de résolution manuelle

### Schéma Zod (payloads)

```ts
const SyncItemPayload = z.object({
  itemType: z.enum(["collection", "environment", "variableMapping", "history", "project", "mockRoute", "mockServer"]),
  itemId: z.string(),
  data: z.unknown(), // payload spécifique au type
})
```

---

## Phases d'implémentation

### Phase 1 : Backend DB + API routes (2-3 fichiers)
- Créer les migrations Supabase (tables `sync_items`, `sync_metadata`)
- Créer les API routes (`/api/sync/push`, `/api/sync/pull`)
- Zod validation des payloads

### Phase 2 : Client sync engine (3-4 fichiers)
- Hook `useSync()` : logique de pull/push/merge
- Queue offline dans IndexedDB
- Merge côté client avec `last-write-wins`

### Phase 3 : UI (2-3 fichiers)
- Indicateur de sync dans la navbar
- Modal de conflits
- Paramètre "auto-sync on/off"

### Phase 4 : Tests
- Tests unitaires du merge
- Tests E2E de sync entre deux "devices"

---

## Décisions de scoping

| # | Question | Réponse | Détail |
|---|----------|---------|--------|
| 1 | **Scope des données** | **Tout synchroniser** | Collections, env, history, mocks, projets, variables. Reqly est un outil complet, une sync partielle créerait de la confusion entre devices. |
| 2 | **Partage équipe** | **Sync personnel multi-device uniquement** | Le partage équipe est une feature payante à prévoir en Phase 2 du produit, pas maintenant. |
| 3 | **Résolution de conflits** | **Automatique + UI manuelle** | Le `last-write-wins` suffit pour 90% des cas, mais pour les collections avec des requêtes modifiées simultanément sur deux devices, l'utilisateur doit pouvoir choisir. Sans UI de conflit, on risque des pertes de données silencieuses qui sont très difficiles à débugger. |
