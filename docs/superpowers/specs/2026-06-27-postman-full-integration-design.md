# Postman Full Integration — Design Spec

**Date** : 2026-06-27
**Auteur** : Alexander S.
**Statut** : En revue
**Stack** : Next.js 15 + TypeScript + Postman API v10 + localStorage (persistence)

---

## 1. Objectif & Non-objectifs

### 1.1 Objectif

Compléter l'intégration Postman pour qu'elle soit **réellement utilisable** end-to-end :
1. Refactor : extraire un helper `postmanFetch()` pour DRY + uniformiser les headers v10
2. UX : remplacer le bouton "Gérer" (actuellement sans effet) par un vrai `PostmanManageModal`
3. UX : créer un `PostmanImportModal` pour confirmer un import avec aperçu
4. Persistence : sauver les collections importées dans le store local (`use-request-store.ts`)
5. Bulk import : bouton "Importer toutes" avec progress
6. Disconnect : vrai bouton "Déconnecter" dans le manage modal

### 1.2 Non-objectifs (V1)

- ❌ Sync des imports vers Supabase (V2)
- ❌ Modification des collections Postman depuis Reqly (V2)
- ❌ Refresh / re-sync automatique des collections importées (V2)
- ❌ Suppression des routes legacy `/api/postman-auth/logout` (gardée pour backward-compat)

### 1.3 Réutilisation de l'existant

- ✅ `lib/postman.ts` — `validatePostmanApiKey()` (déjà fixé pour v10 dans le précédent fix)
- ✅ `ToolAssociationModal` — gère la connexion, on ne le touche pas
- ✅ `useToolStatus` + `refreshKey` mechanism (fix S1) — gère l'état "Connecté/Non connecté"
- ✅ `persistence` utilitaire — pour stocker les routes importées
- ✅ `use-request-store.ts` — store Zustand des routes/collections Reqly
- ✅ Routes existantes : `postman-auth/{route,status,cookies}`, `postman-import/route`, `postman-export/route`

---

## 2. Architecture cible

```
[Postman card connected → click "Gérer"]
    │
    ▼
PostmanManageModal
    ├── Header: "Connecté @username" + bouton [Déconnecter]
    ├── Body: liste collections (fetch /api/postman-auth/collections)
    │       chaque row: nom + # requêtes + bouton [Importer]
    └── Footer: [Importer toutes] [Fermer]
                          │
                          ▼ click [Importer]
                  PostmanImportModal
                          │
                          ├── Aperçu : 3 premières routes + "...et N autres"
                          ├── Footer: [Annuler] [Confirmer]
                          │
                          ▼ click [Confirmer]
                  POST /api/postman-import/save { collectionId, routes }
                          │
                          ▼ server
                  1. re-fetch collection from Postman (sécurité)
                  2. save routes to localStorage
                  3. return { collectionId (Reqly), routeCount }
                          │
                          ▼
                  toast "Importé (N routes)" + fermer modal + refresh store
```

---

## 3. Composants & données

### 3.1 Helper `lib/postman-api.ts`

**Fichier** : `reqy-web/lib/postman-api.ts` (nouveau)

Centralise tous les appels à l'API Postman. Évite la duplication des headers v10.

```ts
const POSTMAN_API_BASE = "https://api.postman.com"
const TIMEOUT_MS = 10000

export class PostmanApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = "PostmanApiError"
  }
}

export async function postmanFetch(
  apiKey: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${POSTMAN_API_BASE}${path}`, {
      ...options,
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/vnd.api.v10+json",
        "User-Agent": "Reqly/1.0",
        ...(options.headers ?? {}),
      },
      signal: controller.signal,
    })
    return res
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function postmanFetchJson<T = unknown>(
  apiKey: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await postmanFetch(apiKey, path, options)
  if (!res.ok) {
    let msg = ""
    try {
      const body = await res.json()
      msg = body?.error?.message ?? body?.message ?? ""
    } catch { /* ignore */ }
    throw new PostmanApiError(res.status, msg || `Erreur Postman (HTTP ${res.status})`)
  }
  return res.json()
}
```

### 3.2 `lib/postman.ts` refactor

**Fichier** : `reqy-web/lib/postman.ts` (modifié)

- `validatePostmanApiKey()` utilise `postmanFetch()` au lieu d'un fetch manuel
- `PostmanApiError` est déplacé dans `postman-api.ts`, ré-exporté ici pour backward-compat

```ts
export { PostmanApiError } from "./postman-api"
import { postmanFetch } from "./postman-api"

export async function validatePostmanApiKey(apiKey: string): Promise<PostmanUser> {
  try {
    const data = await postmanFetchJson<any>(apiKey, "/me")
    return {
      username: data.user?.username ?? data.username ?? "unknown",
      email: data.user?.email ?? data.email,
    }
  } catch (err) {
    if (err instanceof PostmanApiError) throw err
    if (err instanceof Error && err.name === "AbortError") {
      throw new PostmanApiError(0, "Timeout : Postman n'a pas répondu en 10s")
    }
    throw new PostmanApiError(0, "Erreur réseau, réessayez")
  }
}
```

### 3.3 `/api/postman-auth/collections` refactor

**Fichier** : `reqy-web/app/api/postman-auth/collections/route.ts`

- Remplace `fetch(${api.getpostman.com}/collections)` par `postmanFetch(apiKey, "/collections")`
- Le helper ajoute automatiquement v10 + domain
- **Note** : la doc Postman dit que `/collections` retourne `{ collections: [...] }` directement, sans wrapper `data`. Le code actuel gère `data.collections` mais devrait probablement tester les deux. **Décision** : garder `data.collections` pour V1 (compat), noter pour V2.

### 3.4 `/api/postman-import` refactor

**Fichier** : `reqy-web/app/api/postman-import/route.ts`

- Remplace fetch par `postmanFetch(apiKey, `/collections/${id}`)`
- Conserve la logique d'extraction de routes (fonctionne déjà)

### 3.5 Nouvelle route `/api/postman-import/save`

**Fichier** : `reqy-web/app/api/postman-import/save/route.ts` (nouveau)

**Rôle** : Sépare le "fetch depuis Postman" (existant) du "sauvegarde dans Reqly" (nouveau).

**Body** : `{ collectionId: string }` (l'ID Postman ; le server refetch + save)

**Comportement** :
1. Lit le cookie `postman_api_key`
2. Refetch la collection depuis Postman (sécurité anti-IDs forgés)
3. Extrait les routes (même logique que `postman-import/route.ts`)
4. Crée une collection dans le store local via `persistence.setItem("reqly_collections", [...])`
5. Retourne `{ reqlyCollectionId: string, routeCount: number, name: string }`

**Format storage** : même format que ce que le `use-request-store.ts` attend (à confirmer en lisant le store).

### 3.6 `PostmanManageModal` composant

**Fichier** : `reqy-web/components/settings/sections/postman-manage-modal.tsx` (nouveau)

**Spec** :
- shadcn `Dialog`, `max-w-2xl`
- Header : "Connecté en tant que `@username`" + bouton "Déconnecter" (rouge, `variant="outline"`)
- Body : grille de cards pour chaque collection (logo + nom + # requêtes + bouton "Importer")
- Footer : "Importer toutes" + "Fermer"
- État loading pendant fetch des collections
- Empty state si l'utilisateur n'a aucune collection Postman
- Error state si fetch échoue (afficher le message de `PostmanApiError`)

**Refetch** : appelé quand le modal s'ouvre (`useEffect` sur `open`).

**Disconnect** : `DELETE /api/postman-auth` → refresh status local + fermer modal.

### 3.7 `PostmanImportModal` composant

**Fichier** : `reqy-web/components/settings/sections/postman-import-modal.tsx` (nouveau)

**Spec** :
- shadcn `Dialog`, `max-w-md`
- Header : titre "Importer [nom collection]" + description courte
- Body : aperçu des 3 premières routes (METHOD badge + path) + "...et N autres"
- Footer : "Annuler" / "Confirmer l'import"
- Loading state pendant POST

**Reçoit** :
```ts
{
  collectionId: string
  collectionName: string
  routeCount: number
  previewRoutes: Array<{ method: string; path: string; name: string }>
}
```

Le `previewRoutes` est préchargé par le parent (`PostmanManageModal`) au clic sur "Importer" via un appel `POST /api/postman-import` (l'endpoint existant).

### 3.8 Wire "Gérer" dans `ToolsSection`

**Fichier** : `reqy-web/components/settings/sections/tools-section.tsx`

**Changements** :
- Ajouter un state `manageOpen: boolean`
- Quand `onAssociate` est cliqué ET `status === "connected"`, ouvrir `PostmanManageModal` au lieu de `ToolAssociationModal`
- Sinon (déconnecté), ouvrir `ToolAssociationModal` comme actuellement

**Logique** :
```ts
function handleAssociate(tool: Tool) {
  if (tool.id === "postman" && status === "connected") {
    setManageOpen(true)
  } else {
    setActiveTool(tool)
    setOpen(true)  // ToolAssociationModal
  }
}
```

**OnConnected** callback : bump `refreshKey` (déjà câblé) → carte refresh.

### 3.9 Delete `/api/postman-auth/logout` ?

**Décision** : **non, garder**. Déprécier dans le code (commentaire) pour ne rien casser. Une éventuelle suppression sera V2.

---

## 4. Flux & comportements

### 4.1 Cycle de vie d'une connexion Postman (état complet)

```
[Disconnected]
    │
    ▼ click "Associer"
ToolAssociationModal (input API key)
    │
    ▼ POST /api/postman-auth
[Connected]
    │
    ▼ click "Gérer"
PostmanManageModal (liste collections)
    │
    ├── click "Importer" sur une collection
    │       │
    │       ▼ POST /api/postman-import { id }
    │       │
    │       ▼ PostmanImportModal (aperçu)
    │               │
    │               ▼ click "Confirmer"
    │               │
    │               ▼ POST /api/postman-import/save { id }
    │               │
    │               ▼ toast + fermer modal + refresh
    │
    ├── click "Importer toutes"
    │       │
    │       ▼ boucle POST /api/postman-import/save pour chaque
    │       │
    │       ▼ progress indicator
    │
    └── click "Déconnecter"
            │
            ▼ DELETE /api/postman-auth
            │
            ▼ toast + fermer modal + status → disconnected
```

### 4.2 Gestion des erreurs

| Cas | Comportement |
|-----|--------------|
| Fetch collections échoue (401) | Affiche message "Session expirée, reconnectez-vous" + bouton "Reconnecter" |
| Fetch collections échoue (500) | Affiche message générique + bouton "Réessayer" |
| POST import échoue (réseau) | Toast "Erreur réseau", modal reste ouvert |
| POST import échoue (Postman 404) | Toast "Collection introuvable chez Postman" |
| DELETE disconnect échoue | Toast warning, mais ferme le modal quand même |
| Bulk import partiel : collection 3/5 échoue | Continue les suivantes, toast récap "3/5 importées" |

### 4.3 États loading

| Composant | Pendant le load |
|-----------|-----------------|
| `PostmanManageModal` collections | Skeleton rows (3 placeholders gris) |
| `PostmanImportModal` preview | Spinner pendant le POST `/api/postman-import` |
| Bouton "Importer toutes" | Affiche "[2/5] Importation..." pendant la boucle |
| Bouton "Déconnecter" | Spinner pendant le DELETE |

---

## 5. Critères de succès

| # | Critère | Vérifiable par |
|---|---------|----------------|
| C1 | `lib/postman-api.ts` exporte `postmanFetch()` et `postmanFetchJson()` qui ajoutent v10 + domain | Tests unitaires |
| C2 | `lib/postman.ts` est refactoré pour utiliser `postmanFetch()` | Tests existants passent toujours |
| C3 | `/api/postman-auth/collections` utilise `postmanFetch()` (pas de fetch direct) | grep `fetch(` retourne uniquement dans postman-api.ts |
| C4 | `/api/postman-import` utilise `postmanFetch()` | idem |
| C5 | `/api/postman-import/save` existe et persiste les routes | Test E2E |
| C6 | `PostmanManageModal` s'ouvre au clic "Gérer" sur la card Postman | Visuel |
| C7 | Le modal liste les collections de l'utilisateur | Visuel + test E2E |
| C8 | Click "Importer" → `PostmanImportModal` avec aperçu | Visuel |
| C9 | Click "Confirmer" → collection créée dans `/collections` | Test E2E |
| C10 | Click "Importer toutes" → N collections importées successivement | Test E2E |
| C11 | Click "Déconnecter" → cookie effacé, card repasse à "Non connecté" (refresh immédiat) | Visuel |
| C12 | Aucun fichier `fetch(` direct dans les routes Postman | grep |

---

## 6. Tests automatisés

**Unit `lib/__tests__/postman-api.test.ts`** (4 cas) :
- `postmanFetch` ajoute X-API-Key, Accept v10, User-Agent
- `postmanFetch` passe un AbortSignal
- `postmanFetchJson` throw `PostmanApiError` avec status + message sur non-OK
- `postmanFetchJson` retourne le body JSON sur OK

**Unit refactor `lib/__tests__/postman.test.ts`** : ajouter 1 cas :
- `validatePostmanApiKey` utilise `postmanFetch` (vérifiable via mock fetch spy)

---

## 7. Definition of Done

1. ✅ Critères C1-C12 vérifiables
2. ✅ Tests unitaires `postman-api.test.ts` passent (4 nouveaux)
3. ✅ `npx vitest run` exit 0 (tous les tests existants + nouveaux)
4. ✅ `npx tsc --noEmit` aucune nouvelle erreur
5. ✅ `grep -rn 'fetch(' reqy-web/app/api/postman*` ne retourne que `postman-api.ts` (ou un import depuis lui)
6. ✅ Aucun fichier `/api/*` non-Postman modifié

---

## 8. Hors-scope Phase 2

- Sync des imports vers Supabase
- Modification des collections Postman depuis Reqly (POST/PUT/DELETE)
- Refresh automatique (background sync)
- Suppression de `/api/postman-auth/logout`
- Support multi-workspaces pour les imports
