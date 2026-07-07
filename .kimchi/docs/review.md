# Code Review — Importation de collections API (Reqly)

## Verdict

NEEDS_FIXES

L'ensemble corrige bien la plupart des omissions de propagation (body, auth, query params, headers, assertions, scripts) entre l'import et l'éditeur. Cependant, un bug de régression/incohérence subsiste dans `app/(app)/collections/page.tsx` pour l'import Postman : l'URL et l'endpoint sont confondus, ce qui fait perdre l'URL complète en mode legacy et l'endpoint propre en mode riche. De plus, il manque des tests couvrant le parser OpenAPI et le flux Postman legacy enrichi.

## Problèmes

### 1. `app/(app)/collections/page.tsx` — confusion `url` / `endpoint` dans `handleImportPostmanCollection`

**Fichier + ligne :** `/mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web/app/(app)/collections/page.tsx`, lignes 88–101.

**Description :**

```tsx
const source = collection.requests && collection.requests.length > 0 ? collection.requests : (collection.routes ?? [])

source.forEach((item) => {
  const route = item as { method?: string; path?: string; url?: string; name?: string; headers?: Record<string, string>; body?: string; bodyType?: RequestItem["bodyType"]; authType?: RequestItem["authType"]; authToken?: string; queryParams?: RequestItem["queryParams"] }
  const method = (route.method || "GET") as HttpMethod
  const path = route.path || route.url || "/"
  addRequestToCollection(newCollectionId, {
    name: route.name || `${method} ${path}`,
    method,
    url: path,
    endpoint: path,
    headers: route.headers || {},
    body: route.body ?? "",
    bodyType: route.bodyType,
    authType: route.authType,
    authToken: route.authToken,
    queryParams: route.queryParams || [],
  })
})
```

- En mode **legacy** (`collection.routes`), `route.path` vaut `"/login"` et `route.url` vaut `"https://api.example.com/login"`. Le code choisit `path = route.path || route.url || "/"`, donc `url` et `endpoint` reçoivent tous deux `"/login"`. L'URL complète est perdue ; la requête importée n'aura plus de domaine/base URL.
- En mode **riche** (`collection.requests`, objets `ExtractedRequest`), `route.path` n'existe pas, `route.url` vaut l'URL complète et `route.endpoint` vaut le chemin. Le code ne lit pas `route.endpoint` et stocke `url: "https://api.example.com/login"`, `endpoint: "https://api.example.com/login"`, ce qui inverse les rôles attendus et peut polluer l'affichage du path dans l'UI.

**Suggestion de correction :**

Distinguer explicitement les deux shapes et mapper `url` / `endpoint` correctement :

```tsx
const isRichRequest = !!collection.requests && collection.requests.length > 0
const source = isRichRequest ? collection.requests : (collection.routes ?? [])

source.forEach((item) => {
  if (isRichRequest) {
    const req = item as ExtractedRequest
    addRequestToCollection(newCollectionId, {
      name: req.name,
      method: req.method as HttpMethod,
      url: req.url,
      endpoint: req.endpoint,
      headers: req.headers,
      body: req.body,
      bodyType: req.bodyType,
      authType: req.authType,
      authToken: req.authToken,
      queryParams: req.queryParams,
      folderId: req.folderId,
    })
  } else {
    const route = item as { method?: string; path?: string; url?: string; name?: string; headers?: Record<string, string>; body?: string; bodyType?: RequestItem["bodyType"]; authType?: RequestItem["authType"]; authToken?: string; queryParams?: RequestItem["queryParams"] }
    const method = (route.method || "GET") as HttpMethod
    const endpoint = route.path || "/"
    const url = route.url || endpoint
    addRequestToCollection(newCollectionId, {
      name: route.name || `${method} ${endpoint}`,
      method,
      url,
      endpoint,
      headers: route.headers || {},
      body: route.body ?? "",
      bodyType: route.bodyType,
      authType: route.authType,
      authToken: route.authToken,
      queryParams: route.queryParams || [],
    })
  }
})
```

Importer le type `ExtractedRequest` depuis `@/lib/postman` pour éviter le `as` aveugle.

---

### 2. `app/(app)/collections/page.tsx` — `folderId` non propagé pour l'import Postman riche

**Fichier + ligne :** `/mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web/app/(app)/collections/page.tsx`, lignes 88–101.

**Description :**
Le modal `PostmanImportModal` (mode riche) crée déjà les folders et re-mappe les `folderId` avant d'appeler `addRequestToCollection`. Cependant, `handleImportPostmanCollection` dans la page collections ignore ce champ. Si un utilisateur passait directement par le callback `onImport` avec des objets riches contenant `folderId`, la structure dossier serait perdue. Même si le flux actuel utilise `addRequestToCollection` directement dans le modal riche, le handler legacy devrait supporter `folderId` pour rester cohérent avec le brief.

**Suggestion de correction :**
Propager `folderId` dans le cas riche (voir suggestion ci-dessus).

---

### 3. `reqy-web/lib/openapi-import.ts` — `mapSecurityToAuth` retourne `api-key` pour un schéma HTTP inconnu

**Fichier + ligne :** `/mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web/lib/openapi-import.ts`, lignes 552–574.

**Description :**

```ts
if (type === "http") {
  if (schemeField === "bearer") return { authType: "bearer" }
  if (schemeField === "basic") return { authType: "basic" }
  return { authType: "api-key" }
}
```

Si un securityScheme est de type `http` mais n'est ni `bearer` ni `basic` (par ex. `digest`), le code retourne `api-key`, ce qui est incorrect. OpenAPI ne prévoit pas d'autres schemes HTTP courants dans la spec 3.0, mais ce fallback trompeur pourrait amener l'éditeur à afficher un type d'auth erroné.

**Suggestion de correction :**
Retourner `authType: "none"` pour les schemes HTTP non supportés, ou au minimum `authType: "api-key"` uniquement quand c'est justifié. Le plus sûr est :

```ts
if (type === "http") {
  if (schemeField === "bearer") return { authType: "bearer" }
  if (schemeField === "basic") return { authType: "basic" }
  return { authType: "none" }
}
```

---

### 4. Tests manquants pour `openapi-import.ts` et pour le flux legacy enrichi

**Fichier concerné :** `/mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web/lib/openapi-import.ts` (pas de fichier de test associé).

**Description :**
Aucun test ne couvre :
- le mapping `contentType` → `bodyType` (json, form-data, x-www-form, binary, raw),
- le mapping `securitySchemes` → `authType`,
- la génération d'exemple de body à partir des schémas (incluant `$ref`),
- l'extraction des query params et headers,
- le regroupement par tag.

Le parser est maintenant au cœur du correctif du bug d'import ; son absence de tests est un risque de régression.

**Suggestion de correction :**
Créer `/mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web/lib/__tests__/openapi-import.test.ts` avec des cas couvrant :
- POST avec `requestBody.content["application/json"]` → `bodyType: "json"` et body généré,
- PUT avec `multipart/form-data` → `bodyType: "form-data"`,
- security `bearerAuth` → `authType: "bearer"`,
- paramètres `in: query` / `in: header` → `queryParams` / `headers`,
- Swagger 2.0 avec `securityDefinitions` basic.

---

## Ce qui est bien fait

- `reqy-web/lib/request-bridge.ts` étend correctement `PendingCollectionRequest` avec `assertions`, `runnerAssertions`, `preRequestScript`, `postResponseScript`, `datasetKey`, `protocol` et `graphql`. Le pont reste un module-scope simple sans state dupliqué.
- `reqy-web/app/(app)/collections/page.tsx` propage tous les champs du `RequestItem` vers `setPendingCollectionRequest` dans `handleSelectRequest` et `handleSelectAndSendRequest`, y compris les champs tests/scripts.
- `reqy-web/app/api/postman-import/route.ts` enrichit bien le tableau legacy `routes` avec `body`, `bodyType`, `authType`, `authToken`, `queryParams` et `headers` tout en continuant à retourner les shapes riches `folders` / `requests`.
- `reqy-web/lib/import-schemas.ts` accepte les nouveaux champs dans `postmanRouteSchema`.
- `reqy-web/lib/openapi-import.ts` génère un exemple de body à partir du schéma et résout les `$ref`, ce qui corrige le symptôme principal (body vide à l'ouverture d'une requête POST/PUT importée).

## Vérification automatique

Les commandes `npm run lint` et `npm test` n'ont pas pu être exécutées car les liens symboliques de `node_modules` pointent vers un store pnpm parent manquant (`/mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/node_modules/.pnpm/...`). Une réinstallation des dépendances est nécessaire pour valider le type-checking, le lint et la suite de tests.
