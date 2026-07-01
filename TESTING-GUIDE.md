# Reqly — Guide de test des fonctionnalités

Guide pratique pour tester chaque nouvelle fonctionnalité sur l'interface.

---

## 📋 Prérequis

```bash
# 1. Installer les dépendances (racine du repo)
cd apiPlayground-main
pnpm install

# 2. Variables d'environnement (reqy-web/.env.local)
cat > reqy-web/.env.local <<EOF
NEXT_PUBLIC_SYNC_URL=http://localhost:4000
AUTH_SIGNING_SECRET=dev-secret-for-testing-only
EOF

# 3. Démarrer le client (terminal 1)
cd reqy-web
pnpm dev
# → http://localhost:3000

# 4. (Optionnel, pour Cloud sync) Démarrer le serveur de sync (terminal 2)
cd sync-server
AUTH_SIGNING_SECRET=dev-secret-for-testing-only pnpm dev
# → http://localhost:4000
```

**Note** : `AUTH_SIGNING_SECRET` doit être identique entre client et serveur.

---

## 1. Collection Runner

**Quoi** : Exécute une collection de requêtes en séquence, valide les réponses avec des assertions, génère un rapport JUnit.

**Où dans l'UI** :
- Page d'accueil `/` — panneau de requêtes
- Page Collections `/collections` — panneau des collections + bouton "Run"

### Test pas-à-pas

1. **Créer une collection** :
   - Va sur `/collections`
   - Clique sur "New Collection"
   - Nom : `Smoke Test`
   - Crée la collection

2. **Ajouter une requête** :
   - Dans la collection, clique sur "Add Request" ou ouvre la collection
   - Méthode : `GET`
   - URL : `https://httpbin.org/get`
   - Headers : aucun
   - Body : aucun

3. **Ajouter une assertion** (status 200) :
   - Ouvre la requête
   - Cherche l'onglet "Assertions" (⚠️ voir limitation ci-dessous)
   - Ajoute : Type `status`, Expected `200`

4. **Exécuter la collection** :
   - Retourne sur `/collections`
   - Clique sur le bouton "Run" de la collection
   - Tu devrais voir : `1/1 passed in X.XXs`

5. **Exporter en JUnit** :
   - Clique sur le bouton "Export JUnit"
   - Un fichier `.xml` devrait se télécharger
   - Ouvre-le pour vérifier la structure XML

### ⚠️ Limitations connues

- L'éditeur d'assertions (`components/assertion-editor.tsx`) et l'éditeur de scripts (`components/script-editor.tsx`) sont créés mais **pas câblés dans le request panel** (TODO dans `components/request-panel.tsx:26-30`)
- Pour tester les assertions, tu peux soit :
  - Modifier directement le store via les DevTools
  - Utiliser le composant `TestRunnerPanel` standalone

---

## 2. GraphQL natif

**Quoi** : Support natif des requêtes GraphQL (queries, mutations) avec introspection du schema.

**Où dans l'UI** :
- Page d'accueil `/` — panneau de requêtes
- ⚠️ Le sélecteur REST/GraphQL est TODO dans le request panel
- Composant standalone : `components/graphql-panel.tsx`

### Test pas-à-pas avec le composant standalone

Le composant `graphql-panel.tsx` est créé mais pas monté dans l'UI. Pour tester GraphQL, tu peux :

**Option A — Via l'API REST proxy** :
1. Va sur `/`
2. Configure une requête :
   - Méthode : `POST`
   - URL : `https://countries.trevorblades.com/` (endpoint public)
   - Body type : `raw`
   - Body : `{"query":"{ countries { code name } }"}`
   - Headers : `Content-Type: application/json`
3. Send → la réponse contient les pays

**Option B — Test direct des modules** :
```bash
cd reqy-web
# Les modules lib/graphql/ sont testés unitairement
npx vitest run lib/graphql/__tests__/

# Test manuel de l'introspection via curl :
curl -X POST https://countries.trevorblades.com/ \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __schema { queryType { name } } }"}'
```

### Endpoints GraphQL publics pour tester

- `https://countries.trevorblades.com/` — pays du monde
- `https://api.spacex.land.com/graphql/` — données SpaceX
- `https://graphql.github.com/` — API GitHub (rate-limited)

---

## 3. OpenAPI inference depuis l'historique

**Quoi** : Exporte une spec OpenAPI 3.0 où les response schemas sont inférés depuis les vraies réponses de l'historique (pas juste des schémas génériques).

**Où dans l'UI** :
- Page Collections `/collections`
- Bouton d'export OpenAPI (⚠️ la case "Infer from history" a été ajoutée)

### Test pas-à-pas

1. **Exécuter quelques requêtes réelles** :
   - Va sur `/`
   - Fais une requête : `GET https://jsonplaceholder.typicode.com/users/1`
   - La réponse doit être `{"id":1,"name":"Leanne Graham",...}`
   - Fais aussi : `GET https://jsonplaceholder.typicode.com/posts/1`
   - La réponse doit être `{"userId":1,"id":1,"title":...,"body":...}`

2. **Vérifier l'historique** :
   - Ouvre le panneau History (sidebar)
   - Les 2 requêtes doivent apparaître avec leur response

3. **Exporter en OpenAPI** :
   - Va sur `/collections`
   - Ouvre le modal "Export OpenAPI"
   - Cherche la checkbox "Infer schemas from history (merge with generic via allOf)"
   - Coche-la
   - Clique Export
   - Ouvre le fichier YAML/JSON généré

4. **Vérifier le schema inféré** :
   - Cherche l'endpoint `/users/1` dans la spec
   - Le `responses.200.content.application/json.schema` devrait contenir un `allOf` combinant :
     - Le schema générique (vide ou basique)
     - Le schema inféré depuis la vraie réponse (`{id: {type: "number"}, name: {type: "string"}, ...}`)

---

## 4. Cloud sync (multi-utilisateurs)

**Quoi** : Synchronisation des collections/environments/dossiers entre plusieurs utilisateurs via un serveur partagé.

**Prérequis** : Serveur de sync démarré sur :4000 (voir Prérequis plus haut).

### Test pas-à-pas (2 utilisateurs)

**Setup initial** :
1. Démarre le serveur de sync : `cd sync-server && AUTH_SIGNING_SECRET=dev-secret-for-testing-only pnpm dev`
2. Dans `reqy-web/.env.local` : `NEXT_PUBLIC_SYNC_URL=http://localhost:4000`
3. Redémarre le client Reqly

**Utilisateur A — Créer un workspace et générer une invitation** :

Option 1 — Via l'UI :
1. Connecte-toi à Reqly (auth existante)
2. Sidebar → "Join" ou via les workspaces → créer un workspace

⚠️ **Note** : Le bouton "Join" est créé mais le wiring du workspace actif dans la sidebar n'est pas terminé. Pour tester :

Option 2 — Via curl (recommandé pour le test) :
```bash
# 1. Login first (récupère le cookie auth_session)
# Voir la console du navigateur après login → cookie auth_session

# 2. Créer un workspace
curl -X POST http://localhost:4000/api/workspaces \
  -H "Content-Type: application/json" \
  -H "Cookie: auth_session=<ton-cookie>" \
  -d '{"name": "Team Workspace"}'

# Réponse : {"workspace": {"id": "ws-...", ...}}

# 3. Générer une invitation
curl -X POST http://localhost:4000/api/workspaces/ws-XXXXX/invitations \
  -H "Cookie: auth_session=<ton-cookie>"

# Réponse : {"token": "inv-...", "expiresAt": ..., "role": "editor"}
```

**Utilisateur B — Joindre via le token** :

1. Ouvre Reqly dans un autre navigateur (ou fenêtre privée)
2. Connecte-toi avec un **autre compte** (ou crée un nouveau)
3. Dans la sidebar, clique sur "Join" (composant `WorkspaceJoinDialog`)
4. Server URL : `http://localhost:4000`
5. Invite token : colle le token `inv-...` reçu de l'utilisateur A
6. Clique "Join workspace"

**Vérifier la synchronisation** :
1. Utilisateur A modifie une collection
2. Utilisateur B rafraîchit après ~30s (intervalle de polling)
3. La modification devrait apparaître chez B
4. Inversement, une modif chez B apparaît chez A après ~30s

### Vérifier les conflits (LWW)

1. Utilisateur A et B éditent la même collection **sans rafraîchir**
2. A envoie ses changements → OK
3. B envoie ses changements → CONFLIT (serveur rejette car timestamp plus ancien)
4. B devrait voir un banner "1 conflict resolved (server won)"

---

## 5. Import/Export avec résolution de conflits (LWW)

**Quoi** : Lors d'un import, détecte les entités déjà existantes et applique Last-Write-Wins (le plus récent gagne).

**Où dans l'UI** :
- Page Collections `/collections`
- Modal d'import (OpenAPI, Postman, JSON)
- Bannière de résumé après import

### Test pas-à-pas

1. **Créer une collection locale** :
   - Va sur `/collections`
   - Crée `TestCollection` avec quelques requêtes

2. **Exporter en JSON** :
   - Utilise le bouton Export → JSON
   - Sauvegarde le fichier `export.json`

3. **Modifier le JSON** :
   - Ouvre `export.json`
   - Change le `name` de la collection en `TestCollection v2`
   - Change le `updatedAt` à un timestamp futur (ex. `9999999999999`)
   - Sauvegarde

4. **Importer le JSON modifié** :
   - Via le modal d'import, charge le fichier `export.json`
   - Tu devrais voir une bannière :
     ```
     Import complete
     Collections: +0 added, ~1 updated, 0 skipped
     ```
   - La collection locale est maintenant "TestCollection v2"

5. **Test du LWW (local wins)** :
   - Édite la collection locale dans Reqly (note le `updatedAt` actuel)
   - Reprends le `export.json` original (avec un vieux `updatedAt`)
   - Importe-le → devrait voir `+0 added, ~0 updated, 1 skipped` (local gagne)

---

## 6. E2E tests + CI

**Quoi** : 13 scénarios smoke + workflow GitHub Actions qui lance Playwright.

### Lancer les E2E en local

```bash
cd reqy-web

# Démarrer le client dans un terminal
pnpm dev

# Dans un autre terminal, lancer les tests
pnpm test:e2e

# Pour le mode headed (debug)
pnpm test:e2e -- --headed

# Lister les tests sans les exécuter
pnpm test:e2e -- --list
```

### Vérifier le CI

1. Va sur https://github.com/<user>/apiPlayground-main/actions
2. Le workflow "E2E Tests" doit passer sur les PRs et sur main

---

## 🧪 Vérification rapide

Pour vérifier que tout est en place, exécute ces commandes :

```bash
# TypeScript clean
cd reqy-web && npx tsc --noEmit --pretty false 2>&1 | grep "error TS" | wc -l
# → 0

# Tests unitaires
cd reqy-web && npx vitest run
# → ~295 passing (1 préexistant hors scope)

# Server TypeScript
cd sync-server && AUTH_SIGNING_SECRET=test npx tsc --noEmit
# → 0 errors

# Server tests (si better-sqlite3 buildé)
cd sync-server && AUTH_SIGNING_SECRET=test npx vitest run
# → 6 tests pour sync-engine (peut échouer si native binding Linux manquant)
```

---

## 🐛 Problèmes connus

| Problème | Workaround |
|---|---|
| Assertion/script editors pas câblés dans request panel | Utilise les composants standalone ou modifie le store directement |
| GraphQL protocol tabs pas câblés | Utilise l'API REST avec body JSON, ou monte `components/graphql-panel.tsx` manuellement |
| `WorkspaceInviteDialog` pas monté dans la sidebar | Crée les invitations via curl (voir section 4) |
| Test `$.id` regex échoue dans variable-mapping | Préexistant, hors scope de cette session |
| better-sqlite3 native binding mismatch sur Linux | Rebuild : `cd sync-server && pnpm rebuild better-sqlite3` |

---

## 📚 Docs de référence

Tous les designs et plans sont dans `.kimchi/docs/` :

- `2025-06-21-fragilities-fix-design.md`
- `2025-06-21-step2b1-e2e-design.md`
- `2025-06-21-step2b2-cloud-sync-design.md`
- `2025-06-21-import-export-merge-design.md`

Pour la doc existante (en français) : `README.md` à la racine.
