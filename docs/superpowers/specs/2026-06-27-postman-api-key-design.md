# Postman API Key Integration — Design Spec

**Date** : 2026-06-27
**Auteur** : Alexander S.
**Statut** : En revue
**Stack** : Next.js 15 App Router + TypeScript + Postman API (REST)

---

## 1. Objectif & Non-objectifs

### 1.1 Objectif

Implémenter l'intégration Postman **réellement fonctionnelle** (vs le stub actuel qui renvoie JSON) avec un flow API key :

1. User colle sa clé Postman dans un modal
2. Le serveur valide la clé via l'API Postman
3. Si valide → cookie httpOnly `postman_api_key` set
4. La card passe à "Connecté" et la clé est utilisable pour les futurs imports/exports

### 1.2 Non-objectifs (V1)

- ❌ Import réel de collections Postman (V2)
- ❌ Export Reqly → Postman (V2)
- ❌ Refresh automatique de la clé (V2)
- ❌ Multi-key / multi-comptes (V2)
- ❌ OAuth Postman (n'existe pas, l'API utilise uniquement API keys)

### 1.3 Réutilisation de l'existant

- ✅ `ToolAssociationModal` (T9 du ferment précédent) — adapté pour supporter mode `api-key`
- ✅ `ToolsSection` (T10) — `useToolStatus` appelle déjà `/api/postman-auth/status`
- ✅ Cookie httpOnly pattern (cf. `auth_session` du ferment auth UX)
- ✅ Aucun nouveau package npm (utilise `fetch` natif Node 18+)

---

## 2. Architecture cible

```
[User click "Associer" sur card Postman]
    │
    ▼
ToolAssociationModal s'ouvre (mode api-key détecté)
    │
    ▼
[User colle clé PMAK-..., click "Valider"]
    │
    ▼
POST /api/postman-auth { apiKey: "PMAK-..." }
    │
    ├── Server: GET https://api.postman.com/me + X-API-Key header
    │
    ├── 200 OK + user data → set httpOnly cookie postman_api_key
    │       → return { connected: true, user: { username, email } }
    │
    └── 401/403 → return 400 { error: "Clé invalide..." }
    │
    ▼
[Modal ferme, useToolStatus refetch → card "Connecté"]
```

---

## 3. Composants & données

### 3.1 Routes backend

#### `POST /api/postman-auth`

**Fichier** : `reqy-web/app/api/postman-auth/route.ts` (remplace le stub actuel)

**Body** : `{ apiKey: string }`

**Comportement** :
1. Valide que `apiKey` est non-vide et commence par `PMAK-`
2. Appelle `GET https://api.postman.com/me` avec `X-API-Key: <apiKey>`
3. Si 200 → set cookie httpOnly `postman_api_key` (30j, sameSite=lax, secure=prod only) + retourne `{ connected: true, user: { username, email } }`
4. Si 401/403 ou erreur réseau → retourne 400 `{ error: "Clé API invalide ou expirée" }`
5. Timeout 10s sur l'appel Postman (AbortController)

#### `GET /api/postman-auth/status`

**Fichier** : `reqy-web/app/api/postman-auth/status/route.ts` (nouveau)

**Comportement** :
1. Lit le cookie `postman_api_key`
2. Si présent → retourne `{ connected: true, user: { username: "stored-username" } }` (cache simple)
3. Sinon → `{ connected: false }`

**Note** : V1 ne re-valide pas le cookie à chaque appel (perf). Si le user révoque sa clé chez Postman, le statut reste "Connecté" jusqu'à la prochaine validation. Acceptable pour MVP.

#### `DELETE /api/postman-auth`

**Fichier** : `reqy-web/app/api/postman-auth/route.ts` (même fichier, ajoute la méthode DELETE)

**Comportement** : clear le cookie + retourne `{ ok: true }`.

### 3.2 Helper `lib/postman.ts`

**Fichier** : `reqy-web/lib/postman.ts` (nouveau)

```ts
const POSTMAN_API_BASE = "https://api.postman.com"

export interface PostmanUser {
  username: string
  email?: string
}

export async function validatePostmanApiKey(apiKey: string): Promise<PostmanUser | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(`${POSTMAN_API_BASE}/me`, {
      headers: { "X-API-Key": apiKey },
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = await res.json()
    return { username: data.user?.username ?? "unknown", email: data.user?.email }
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}
```

### 3.3 Cookie helpers

**Fichier** : `reqy-web/app/api/postman-auth/cookies.ts` (nouveau, suit le pattern de `auth/session.ts`)

```ts
const COOKIE_NAME = "postman_api_key"
const DURATION_S = 30 * 24 * 60 * 60

export function buildApiKeyCookie(value: string) {
  return {
    name: COOKIE_NAME,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: DURATION_S,
  }
}

export function buildClearApiKeyCookie() {
  return {
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  }
}

export function getApiKeyFromRequest(request: { cookies: { get(name: string): { value: string } | undefined } }): string | null {
  return request.cookies.get(COOKIE_NAME)?.value ?? null
}
```

### 3.4 `ToolAssociationModal` adapté

**Fichier** : `reqy-web/components/settings/sections/tool-association-modal.tsx`

**Ajout au type `Tool`** :
```ts
apiKey?: {
  endpoint: string
  placeholder: string
  instructions: string
}
```

**Nouveau mode rendu** : si `tool.apiKey`, afficher l'UI input + bouton "Valider et connecter" au lieu du bouton OAuth redirect.

```tsx
{tool.apiKey ? (
  <ApiKeyForm tool={tool} onSuccess={() => onOpenChange(false)} />
) : (
  <OAuthRedirectButton tool={tool} />
)}
```

**`ApiKeyForm`** (sous-composant local) :
- État local : `apiKey`, `loading`, `error`
- Input avec validation regex `^PMAK-`
- Bouton désactivé si invalide ou loading
- Submit : POST vers `tool.apiKey.endpoint` avec `{apiKey}`
- Erreur → affichage inline + clear input
- Succès → `onSuccess()` (le parent ferme le modal, useToolStatus refetch automatique)

### 3.5 Config `ToolsSection` mise à jour

```ts
const TOOLS: Tool[] = [
  {
    id: "postman",
    name: "Postman",
    description: "Import et export de collections Postman.",
    logoEmoji: "📮",
    scopes: [],
    apiKey: {
      endpoint: "/api/postman-auth",
      placeholder: "PMAK-xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      instructions: "Allez sur go.postman.co → Settings → API Keys → Generate API Key. Copiez la clé (elle commence par PMAK-).",
    },
  },
  // github : inchangé (oauthUrl)
  // linear : inchangé (ni oauthUrl ni apiKey → stub)
]
```

---

## 4. Critères de succès

| # | Vérification |
|---|--------------|
| C1 | `POST /api/postman-auth` valide une vraie clé Postman via leur API `/me` (test avec une vraie clé) |
| C2 | Clé invalide → 400 avec message clair, pas de cookie set |
| C3 | Clé valide → cookie `postman_api_key` httpOnly set pour 30j |
| C4 | `GET /api/postman-auth/status` renvoie `{connected: true}` quand cookie valide, sinon `{connected: false}` |
| C5 | Modal Postman affiche input API key (pas de redirect OAuth) |
| C6 | Card passe à "Connecté" après validation réussie (auto-refresh) |
| C7 | `DELETE /api/postman-auth` efface le cookie + card repasse à "Non connecté" |
| C8 | GitHub OAuth flow reste fonctionnel (non régressé) |
| C9 | Linear stub reste fonctionnel (toast "Bientôt disponible") |

---

## 5. Tests automatisés

**Unit** : `lib/__tests__/postman.test.ts` (4 cas)
- `validatePostmanApiKey` avec clé valide → retourne user
- Avec réponse 401 → retourne null
- Avec timeout (10s) → retourne null
- Avec erreur réseau → retourne null

Mock `global.fetch` pour les 4 cas.

---

## 6. Definition of Done

1. ✅ Critères C1-C9 vérifiables manuellement
2. ✅ Tests unitaires `postman.test.ts` passent (4 cas)
3. ✅ `npx tsc --noEmit` aucune nouvelle erreur
4. ✅ Les fichiers `tools-section.tsx` et `tool-association-modal.tsx` sont les seuls fichiers UI modifiés
5. ✅ Aucune régression : `pnpm vitest run` exit 0 (tests existants)

---

## 7. Hors-scope Phase 2

- Import réel des collections Postman (endpoint `/api/postman-auth/collections` à compléter)
- Export Reqly → Postman
- Refresh token / re-validation périodique
- Multi-key / multi-comptes
