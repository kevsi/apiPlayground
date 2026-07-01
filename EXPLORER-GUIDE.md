# Reqly — Guide d'exploration complet

> **Objectif** : ce document te guide pas-à-pas dans **chaque fonctionnalité** de Reqly. Il explique le quoi, le pourquoi, le comment, et donne des **exemples concrets** pour que tu puisses tester toi-même.

---

## 📑 Table des matières

1. [Mise en route](#1-mise-en-route)
2. [L'éditeur de requêtes REST](#2-lediteur-de-requêtes-rest)
3. [L'historique](#3-lhistorique)
4. [Les collections](#4-les-collections)
5. [Les environnements et variables](#5-les-environnements-et-variables)
6. [Les onglets multiples](#6-les-onglets-multiples)
7. [Le Collection Runner (cœur de Reqly)](#7-le-collection-runner-cœur-de-reqly)
8. [GraphQL natif](#8-graphql-natif)
9. [OpenAPI — Export et inférence depuis l'historique](#9-openapi--export-et-inférence-depuis-lhistorique)
10. [Code-gen SDK TypeScript](#10-code-gen-sdk-typescript)
11. [Import / Export avec résolution LWW](#11-import--export-avec-résolution-lww)
12. [Cloud sync multi-utilisateurs](#12-cloud-sync-multi-utilisateurs)
13. [Notifications et thème](#13-notifications-et-thème)
14. [Raccourcis clavier](#14-raccourcis-clavier)
15. [L'assistant IA](#15-lassistant-ia)
16. [L'app desktop Tauri](#16-lapp-desktop-tauri)
17. [Architecture et debugging](#17-architecture-et-debugging)

---

## 1. Mise en route

### Prérequis

| Outil | Version | Vérification |
|---|---|---|
| Node.js | ≥ 20 | `node --version` |
| pnpm | ≥ 9 | `pnpm --version` |
| Git | recent | `git --version` |

### Installation (5 minutes)

```bash
# 1. Cloner le repo
git clone <repo-url>
cd apiPlayground-main

# 2. Installer les dépendances
pnpm install

# 3. Setup les variables d'environnement
cat > reqy-web/.env.local <<EOF
NEXT_PUBLIC_SYNC_URL=http://localhost:4000
AUTH_SIGNING_SECRET=dev-secret-for-testing-only
EOF

# 4. Démarrer l'app web
cd reqy-web
pnpm dev
```

**Ouvrir** : http://localhost:3000

### Pour tester le Cloud sync (optionnel)

```bash
# Dans un autre terminal
cd sync-server
AUTH_SIGNING_SECRET=dev-secret-for-testing-only pnpm dev
```

Le serveur démarre sur http://localhost:4000.

### Pour utiliser l'app desktop Tauri (optionnel)

```bash
cd reqy-web
pnpm tauri:dev
```

---

## 2. L'éditeur de requêtes REST

### C'est quoi ?

Le panneau principal pour envoyer des requêtes HTTP. C'est l'équivalent de Postman/Insomnia mais intégré à Reqly.

### Où le trouver ?

Page d'accueil `/` — le panneau central "Request".

### Anatomie de l'éditeur

```
┌─────────────────────────────────────────────────┐
│ [GET ▼]  https://api.example.com/users  [Send]   │  ← Barre d'URL
├─────────────────────────────────────────────────┤
│ [Params] [Headers] [Body] [Scripts] [Assertions]│  ← Tabs de config
│                                                  │
│  ┌──────────────────────────────────────────┐  │
│  │ (contenu du tab sélectionné)             │  │
│  └──────────────────────────────────────────┘  │
├─────────────────────────────────────────────────┤
│ Response: 200 OK · 234ms · 1.2KB                │
│ [Body] [Headers] [Cookies] [History]            │  ← Tabs de réponse
│  ┌──────────────────────────────────────────┐  │
│  │ {                                        │  │
│  │   "id": 1,                               │  │
│  │   "name": "Alice"                        │  │
│  │ }                                        │  │
│  └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Exemple : GET /users

**Objectif** : récupérer une liste d'utilisateurs depuis JSONPlaceholder.

1. Méthode : `GET`
2. URL : `https://jsonplaceholder.typicode.com/users`
3. Clique sur **Send**
4. Tu devrais voir :
   - Status `200 OK` en vert
   - Temps de réponse ~200-500ms
   - Taille ~3KB
   - Un tableau JSON de 10 utilisateurs

**Pour aller plus loin** :
- Onglet **Headers** → ajoute `Accept: application/json`
- Onglet **Params** → query params automatiques depuis l'URL

### Exemple : POST avec JSON body

**Objectif** : créer un nouvel utilisateur.

1. Méthode : `POST`
2. URL : `https://jsonplaceholder.typicode.com/users`
3. Onglet **Body** → sélectionne `json`
4. Saisis :
```json
{
  "name": "Alice Dev",
  "username": "alice",
  "email": "alice@example.com"
}
```
5. Clique **Send**
6. Réponse : `201 Created` avec l'utilisateur créé (id 11)

### Exemple : Authentification Bearer

1. Onglet **Headers**
2. Ajoute un header : `Authorization: Bearer eyJhbGciOiJIUzI1NiIs...`
3. Send → le serveur reconnaît l'utilisateur authentifié

### Exemple : Authentification Basic

1. Onglet **Body** → onglet **Authorization**
2. Type : `Basic Auth`
3. Username : `admin`
4. Password : `secret`
5. Send

### Types de body supportés

| Type | Usage |
|---|---|
| `json` | API REST moderne (le plus courant) |
| `form-data` | Upload de fichiers, formulaires multipart |
| `x-www-form-urlencoded` | Formulaires HTML classiques |
| `raw` | Texte brut, XML, etc. |
| `binary` | Upload de fichiers binaires |

---

## 3. L'historique

### C'est quoi ?

Chaque requête envoyée est automatiquement sauvegardée dans l'historique. Tu peux la rejouer, la rouvrir dans l'éditeur, ou la supprimer.

### Où le trouver ?

- Bouton **History** dans la sidebar
- Onglet **History** dans la zone de réponse (historique de la requête actuelle)

### Exemple : explorer l'historique

1. Envoie 5-6 requêtes différentes (GET, POST, etc.)
2. Ouvre le panneau **History** (sidebar)
3. Tu vois la liste de toutes les requêtes avec :
   - Méthode + URL (couleur par méthode)
   - Status code (vert = 2xx, orange = 3xx-4xx, rouge = 5xx)
   - Temps de réponse
4. Clique sur une entrée → elle se rouvre dans l'éditeur

### Astuces

- **Rejouer rapidement** : clique sur l'icône ▶ à côté d'une entrée
- **Supprimer** : survole → icône poubelle
- **Vider tout** : bouton "Clear all" en haut du panneau
- **Limite** : 100 entrées max (les plus anciennes sont supprimées automatiquement)

---

## 4. Les collections

### C'est quoi ?

Une collection = un groupe de requêtes liées. Tu peux les organiser en dossiers, les partager, les exporter.

### Où les trouver ?

- Page `/collections` (panneau latéral)
- Ou clique sur **Collections** dans la sidebar

### Anatomie

```
📁 My API
├── 📂 Users
│   ├── GET /users
│   ├── GET /users/:id
│   └── POST /users
├── 📂 Auth
│   ├── POST /login
│   └── POST /refresh
└── 📂 Posts
    ├── GET /posts
    └── DELETE /posts/:id
```

### Exemple : créer une collection "Pet Store"

**Objectif** : organiser les requêtes d'une API Pet Store.

1. Va sur `/collections`
2. Clique **New Collection**
3. Nom : `Pet Store`
4. Crée 3 dossiers : `Pets`, `Store`, `Users`
5. Ajoute des requêtes dans chaque dossier :
   - `Pets` → `GET https://petstore3.swagger.io/api/v3/pet/findByStatus?status=available`
   - `Pets` → `GET https://petstore3.swagger.io/api/v3/pet/1`
   - `Store` → `GET https://petstore3.swagger.io/api/v3/store/inventory`
   - `Users` → `GET https://petstore3.swagger.io/api/v3/user/login?username=test&password=test`

### Drag & drop

- Glisse une requête vers un dossier pour la déplacer
- Glisse un dossier vers un autre dossier pour créer une hiérarchie

### Export / Import

- Bouton **Export** sur une collection → télécharge un JSON
- Bouton **Import** → charge un JSON (Postman v2.1 ou format Reqly)

---

## 5. Les environnements et variables

### C'est quoi ?

Un environnement = un ensemble de variables (`baseUrl`, `token`, etc.) que tu peux injecter dans tes requêtes avec la syntaxe `{{variable}}`.

### Où les trouver ?

- Sidebar → **Environments** (ou `/environments`)
- Onglet **Variables** dans l'éditeur de requête (pour des variables ad-hoc)

### Exemple : environnement "Production"

1. Crée un environnement `Production`
2. Ajoute les variables :
   - `baseUrl` = `https://api.production.com`
   - `token` = `Bearer abc123xyz`
3. Active cet environnement
4. Dans une requête, utilise : `{{baseUrl}}/users`
5. Le système remplace automatiquement par `https://api.production.com/users`

### Exemple : variables dans les headers

Header : `Authorization: {{token}}` → devient `Authorization: Bearer abc123xyz`

### Environnements multiples

Crée plusieurs environnements (Dev, Staging, Production) et bascule entre eux via le sélecteur en haut de la sidebar.

### Variable non définie ?

Si tu utilises `{{undefinedVar}}`, Reqly :
- Affiche un warning dans l'UI
- Envoie la requête avec `{{undefinedVar}}` littéral (le serveur recevra une erreur)

---

## 6. Les onglets multiples

### C'est quoi ?

Tu peux avoir plusieurs onglets de requête ouverts simultanément dans le même panneau.

### Où les trouver ?

En haut du panneau de requête, juste sous la barre d'URL.

### Exemple : tester 2 endpoints en parallèle

1. Ouvre un onglet, configure `GET https://api.example.com/users`
2. Clique sur le **+** pour créer un nouvel onglet
3. Configure `POST https://api.example.com/users`
4. Bascule entre les onglets avec Ctrl+Tab ou clic

### Raccourcis

- **Ctrl+T** : nouvel onglet
- **Ctrl+W** : fermer l'onglet actuel
- **Ctrl+1-9** : aller à l'onglet N

---

## 7. Le Collection Runner (cœur de Reqly)

### C'est quoi ?

Exécute une collection entière en séquence, valide chaque réponse avec des **assertions**, et génère un rapport. C'est l'équivalent de Newman (CLI Postman) intégré à Reqly.

### Où le trouver ?

- Page `/collections` → bouton **Run** sur une collection
- Onglet **Tests** dans le panneau de réponse

### Les 4 types d'assertions

#### 1. **Status** — vérifier le code HTTP

Ajoute une assertion `status` :
- Type : `equals` → `200`
- Type : `in` → `[200, 201, 204]`
- Type : `not` → `500`

**Exemple** : `status equals 200` → passe si status = 200, échoue sinon.

#### 2. **Response time** — vérifier la performance

Ajoute une assertion `responseTime` :
- Opérateur : `<`, `<=`, `>`, `>=`
- Valeur : en millisecondes

**Exemple** : `responseTime < 500` → passe si la requête a pris moins de 500ms.

#### 3. **JSON path** — vérifier une valeur dans la réponse

Ajoute une assertion `jsonPath` :
- Path : syntaxe JSONPath (`$.user.email`, `$.users[0].name`)
- Opérateur : `equals`, `contains`, `exists`, `notExists`
- Valeur : la valeur attendue

**Exemples** :
- `$.id equals 1` → vérifie que `response.id === 1`
- `$.name contains "Alice"` → vérifie que `response.name` contient "Alice"
- `$.email exists` → vérifie que `response.email` existe

#### 4. **Schema** — valider contre un JSON Schema

Ajoute une assertion `schema` :
- Schema : un JSON Schema (objet avec `type`, `properties`, `required`, etc.)

**Exemple** :
```json
{
  "type": "object",
  "required": ["id", "name", "email"],
  "properties": {
    "id": { "type": "number" },
    "name": { "type": "string" },
    "email": { "type": "string" }
  }
}
```

### Les scripts pre/post

#### Pre-request script

Exécuté **avant** chaque requête. Utile pour :
- Générer des tokens dynamiquement
- Hasher des passwords
- Logger des infos

**Exemple** : logger le timestamp avant chaque requête
```javascript
console.log(`[${new Date().toISOString()}] Running request`)
pm.environment.set("nonce", Math.random().toString())
```

#### Post-response script

Exécuté **après** chaque requête. Utile pour :
- Valider la réponse (alternative aux assertions)
- Extraire des valeurs pour les requêtes suivantes
- Logger les résultats

**Exemple** : sauvegarder le token reçu
```javascript
const data = pm.response.json()
pm.environment.set("authToken", data.token)
```

### API `pm.*` (style Postman)

Dans les scripts, tu as accès à :
- `pm.environment.get(key)` / `set(key, value)` — variables d'environnement
- `pm.variables.get(key)` / `set(key, value)` — variables d'itération (data-driven)
- `pm.iterationData.get(key)` — données de la ligne actuelle
- `pm.request` — la requête actuelle
- `pm.response` — la réponse (status, json(), text(), headers)
- `pm.expect(value).to.equal(expected)` — assertions inline
- `console.log()` — logs (sortis dans le rapport)

### Sandbox sécurisé

Les scripts s'exécutent dans une **VM isolée** (Node `vm` module). Pas d'accès à `require`, `process`, `fs`, etc. Sécurité garantie.

### Data-driven testing

Exécute la même requête avec différents jeux de données.

**Étape 1** : crée un dataset JSON
```json
[
  { "userId": 1, "expectedName": "Leanne Graham" },
  { "userId": 2, "expectedName": "Ervin Howell" },
  { "userId": 3, "expectedName": "Clementine Bauch" }
]
```

**Étape 2** : dans ta requête, utilise les variables d'itération :
- URL : `{{baseUrl}}/users/{{userId}}`
- Assertion : `$.name equals {{expectedName}}`

**Étape 3** : lance le runner. Il exécutera 3 fois (une par ligne).

### Export JUnit XML

Après avoir lancé une collection, clique sur **Export JUnit**. Un fichier `.xml` est téléchargé, compatible avec :
- Jenkins
- GitHub Actions
- GitLab CI
- CircleCI

**Exemple de JUnit généré** :
```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="Pet Store" tests="5" failures="0" time="2.34">
  <testsuite name="Pet Store" tests="5" failures="0" time="2.34">
    <testcase name="GET /pets" time="0.234"/>
    <testcase name="GET /pets/1" time="0.189"/>
    ...
  </testsuite>
</testsuites>
```

### CLI runner (pour CI/CD)

```bash
cd reqy-web
pnpm tsx scripts/run-collection.ts \
  --collection ./collections/petstore.json \
  --dataset ./collections/users.json \
  --junit ./reports/result.xml
```

**Exit codes** :
- `0` : tous les tests passent
- `1` : au moins un échec
- `2` : erreur (fichier introuvable, etc.)

---

## 8. GraphQL natif

### C'est quoi ?

Support natif des requêtes GraphQL (queries, mutations) avec introspection du schéma.

### Où le trouver ?

Dans l'éditeur de requête, change le protocole via les tabs **REST / GraphQL**.

### Endpoints publics pour tester

| Endpoint | Description |
|---|---|
| `https://countries.trevorblades.com/` | Pays du monde |
| `https://api.spacex.land.com/graphql/` | Données SpaceX |
| `https://demo.saleor.io/graphql/` | E-commerce |

### Exemple : query simple

**Endpoint** : `https://countries.trevorblades.com/`

**Query** :
```graphql
{
  countries {
    code
    name
    capital
    currency
  }
}
```

**Variables** : `{}`

**Result** : liste de ~250 pays avec leur code, nom, capitale, devise.

### Exemple : query avec variables

**Query** :
```graphql
query GetCountry($code: ID!) {
  country(code: $code) {
    name
    capital
    continent {
      name
    }
  }
}
```

**Variables** (JSON) :
```json
{
  "code": "FR"
}
```

**Result** : `{ country: { name: "France", capital: "Paris", continent: { name: "Europe" } } }`

### Exemple : mutation

**Query** :
```graphql
mutation AddStar($repoId: ID!) {
  addStar(input: { starrableId: $repoId }) {
    starrable {
      stargazersCount
    }
  }
}
```

### Introspection du schéma

1. Saisis l'endpoint GraphQL
2. Clique sur **Introspect schema**
3. Le schéma SDL est récupéré et mis en cache
4. Tu peux l'utiliser pour explorer les types et fields disponibles

**Exemple de SDL récupéré** :
```graphql
type Query {
  countries: [Country!]!
  country(code: ID!): Country
  continents: [Continent!]!
}

type Country {
  code: ID!
  name: String!
  capital: String
  currency: String
  continent: Continent
}
```

### Headers spécifiques GraphQL

| Header | Usage |
|---|---|
| `Authorization` | Bearer token |
| `X-Request-ID` | Correlation ID pour le debugging |

---

## 9. OpenAPI — Export et inférence depuis l'historique

### C'est quoi ?

Exporte ta collection Reqly en spec **OpenAPI 3.0**, avec la possibilité d'**inférer les schémas de réponse** depuis les vraies réponses HTTP.

### Où le trouver ?

Page `/collections` → bouton **Export** sur une collection → **Export OpenAPI**.

### Exemple complet : de l'API réelle à la spec

**Étape 1** : exécute des requêtes réelles
- `GET https://jsonplaceholder.typicode.com/users/1`
- `GET https://jsonplaceholder.typicode.com/posts/1`

Tu as maintenant 2 entrées dans l'historique avec les vrais response bodies.

**Étape 2** : exporte
- Ouvre le modal d'export OpenAPI
- Coche **"Infer schemas from history"**
- Clique **Export**
- Télécharge le YAML ou JSON

**Étape 3** : examine le résultat

```yaml
openapi: 3.0.0
info:
  title: My Collection
  version: 1.0.0
paths:
  /users/1:
    get:
      operationId: getUsers1
      responses:
        '200':
          content:
            application/json:
              schema:
                allOf:
                  - type: object
                  - type: object
                    properties:
                      id: { type: number }
                      name: { type: string }
                      email: { type: string }
                      username: { type: string }
                    required: [id, name, email, username]
              example:
                id: 1
                name: "Leanne Graham"
                email: "Sincere@april.biz"
                username: "Bret"
```

### Cas : sans inférence

Si tu décoches "Infer schemas from history", les schémas sont **génériques** (juste `{ type: "object" }` sans propriétés). Moins utile pour les consommateurs de l'API.

### Cas : plusieurs exécutions

Si une même requête a été exécutée plusieurs fois, le schéma inféré est le **merge** (allOf) de toutes les exécutions. Plus le sample size est grand, plus le schéma est précis.

### Utilisation de la spec exportée

La spec peut être :
- Importée dans Postman/Insomnia
- Servie via Swagger UI / Redoc
- Utilisée pour générer des SDK clients (voir section suivante)
- Utilisée pour des outils de contract testing

---

## 10. Code-gen SDK TypeScript

### C'est quoi ?

Génère un **client TypeScript** complet à partir d'une spec OpenAPI exportée. Tu obtiens un fichier `types.ts` (interfaces) et `client.ts` (fonctions fetch).

### Où le trouver ?

Page `/collections` → Export OpenAPI → **Download TypeScript SDK**.

### Exemple : de la spec au SDK

**Étape 1** : exporte une spec OpenAPI (voir section précédente).

**Étape 2** : clique sur **Download TypeScript SDK** dans le modal d'export.

**Étape 3** : récupère le fichier `.ts` téléchargé (ex: `mycollection-sdk.ts`).

### Contenu généré

Le fichier contient 2 sections (séparées par des commentaires) :

#### `types.ts`
```typescript
export interface User {
  id: number;
  email: string;
  name: string;
}

export interface Post {
  id: number;
  title: string;
  body: string;
  userId: number;
}
```

#### `client.ts`
```typescript
const BASE_URL = "https://api.example.com";

export async function getUsers(options: RequestOptions = {}): Promise<unknown> {
  const url = new URL(`/users`, BASE_URL);
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { "Content-Type": "application/json", ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return res.json();
}

export async function getUsersId(id: string, options: RequestOptions = {}): Promise<unknown> {
  const url = new URL(`/users/${id}`, BASE_URL);
  // ... same pattern with path param interpolation
}
```

### Utilisation dans un autre projet

```typescript
import { getUsers, getUsersId } from "./mycollection-sdk"

const users = await getUsers({ query: { limit: 10 } })
const user = await getUsersId("1")
```

### Cas : paramètres de path

Les paramètres `{id}` dans OpenAPI deviennent des arguments de fonction :
- OpenAPI : `/users/{id}`
- SDK : `getUsersId(id: string, options)`

### Cas : query params

Passés via `options.query` :
- OpenAPI : `/search?q={query}&limit={limit}`
- SDK : `getSearch({ query: { q: "test", limit: 10 } })`

### Cas : body (POST/PUT/PATCH)

Passé via `options.body` :
- OpenAPI : POST `/users` avec body JSON
- SDK : `createUser({ body: { name: "Alice", email: "alice@x.com" } })`

### Roadmap

- **MVP** : TypeScript seulement
- **Prochainement** : Python (httpx + pydantic) et Go (net/http + structs)
- L'architecture est extensible — voir `lib/sdk-codegen/typescript-generator.ts`

---

## 11. Import / Export avec résolution LWW

### C'est quoi ?

Lors d'un import, si une collection existe déjà localement avec le même ID, Reqly applique **Last-Write-Wins** par timestamp. Tu vois un résumé de ce qui a été ajouté / mis à jour / ignoré.

### Où le trouver ?

Page `/collections` → bouton **Import** → choisis un format (Postman, OpenAPI, JSON Reqly).

### Algorithme LWW

Pour chaque entité importée :
- **Pas dans le local** → AJOUTÉ
- **Dans le local + importé plus récent** → MIS À JOUR (remplace)
- **Dans le local + local plus récent** → IGNORÉ (local wins)

### Exemple : conflit résolu par LWW

**État initial** :
- Local : collection "API" modifiée le 2025-01-15
- Fichier exporté : même collection "API" modifiée le 2025-01-20

**Action** : importer le fichier

**Résultat** :
- ✅ Mis à jour (l'import gagne car plus récent)

**Cas inverse** :
- Local : collection "API" modifiée le 2025-01-20
- Fichier : modifié le 2025-01-15

**Résultat** :
- ⏭️ Ignoré (local gagne)

### Bannière de résumé

Après import, une bannière affiche :
```
Import complete
Collections: +0 added, ~1 updated, 0 skipped
Environments: +0 added, ~0 updated, 0 skipped
```

Déplie les détails pour voir les conflits individuels.

### Cas : collections sans timestamp

Si une entité importée n'a pas de champ `updatedAt`, elle est traitée comme **maintenant** (gain automatique). Le local gagne uniquement s'il a un timestamp explicite plus récent.

### Workflow recommandé

1. **Exporter régulièrement** depuis la collection (garde une copie)
2. **Modifier la copie** (hors ligne, avec un autre outil, etc.)
3. **Réimporter** — les changements sont fusionnés intelligemment
4. **Vérifier la bannière** pour voir ce qui a changé

---

## 12. Cloud sync multi-utilisateurs

### C'est quoi ?

Synchronise les workspaces (collections, environments, dossiers) entre plusieurs utilisateurs via un serveur partagé. Les changements sont propagés en temps réel via **WebSocket** (avec polling 30s en fallback).

### Setup

**1. Démarrer le serveur de sync** :
```bash
cd sync-server
AUTH_SIGNING_SECRET=dev-secret-for-testing-only pnpm dev
```
Le serveur écoute sur `http://localhost:4000`.

**2. Configurer le client** : `reqy-web/.env.local` doit contenir :
```
NEXT_PUBLIC_SYNC_URL=http://localhost:4000
AUTH_SIGNING_SECRET=dev-secret-for-testing-only
```

**3. Démarrer Reqly** : `pnpm dev` dans `reqy-web/`.

### Boucle complète (4 boutons dans la sidebar)

#### A. Créer un workspace (utilisateur A)

1. Sidebar → **+ New workspace**
2. Server URL : `http://localhost:4000`
3. Workspace name : `Team Alpha`
4. **Create workspace**
5. Tu es maintenant owner. Ton workspace est actif.

#### B. Inviter un队友 (utilisateur A)

1. Sidebar → **Invite** (bouton visible car tu as un workspace actif)
2. **Generate invite token**
3. Copie le token (ex: `inv-abc123`)
4. Envoie-le à ton teammate (Slack, email, etc.)

#### C. Rejoindre (utilisateur B)

1. Ouvre Reqly dans un autre navigateur (ou fenêtre privée)
2. Connecte-toi avec un **autre compte**
3. Sidebar → **Join**
4. Server URL : `http://localhost:4000`
5. Invite token : colle le token reçu
6. **Join workspace**
7. Tu es maintenant membre du workspace.

#### D. Synchronisation

1. Utilisateur A modifie une collection
2. Utilisateur B rafraîchit après ~1s (WebSocket) ou 30s (polling)
3. La modification apparaît chez B

### Indicateurs visuels

- **Sidebar** : affiche le workspace actif (nom + ID)
- **Bannière en bas à droite** : status du sync (syncing / last sync time / conflicts)
- **Bouton Retry** : si la sync échoue, clique pour réessayer

### Résolution de conflits (Cloud sync)

Contrairement à l'import/export local (LWW), le Cloud sync gère les conflits **côté serveur** :
- Le serveur stocke le timestamp de chaque entité
- Si le client pousse avec un timestamp plus ancien → **rejeté**
- Le client reçoit la liste des conflits et met à jour son état local

**Affichage des conflits** : la bannière SyncStatusBanner affiche :
```
1 conflict resolved (server won)
[dismiss]
```

### Architecture

```
Client A (modifie)          Server (Hono + SQLite)
       │                              │
       │─── POST /api/sync/push ──────▶│
       │                              │── Broadcast WS
       │                              │   to all clients
       │                              │   in workspace
       │                              │
       │      ┌─────────────────┐     │
       └──────│  WS /api/sync/ws │◀────┘
              └─────────────────┘
                     │
                     ▼
              Client B (reçoit push)
```

### Tests multi-utilisateurs

Pour tester avec 2 utilisateurs en local :
1. Ouvre une fenêtre normale (User A)
2. Ouvre une fenêtre privée/incognito (User B)
3. Crée 2 comptes Reqly (ou utilise l'auth existante)
4. Suis la boucle A-B-C-D ci-dessus

---

## 13. Notifications et thème

### Notifications in-app

Des notifications apparaissent en bas à droite pour informer des événements :
- "Request completed" (avec status + temps)
- "Collection test completed" (run terminé)
- "AI response ready"
- "Import/export terminé"

**Personnalisation** : Settings → Notifications (cocher/décocher les types).

### Thème clair/sombre

- Bouton dans la sidebar (icône soleil/lune)
- Toggle instantané
- Préférence sauvegardée dans localStorage

---

## 14. Raccourcis clavier

| Raccourci | Action |
|---|---|
| `Ctrl+Enter` | Envoyer la requête |
| `Ctrl+T` | Nouvel onglet |
| `Ctrl+W` | Fermer l'onglet actuel |
| `Ctrl+S` | Sauvegarder la requête |
| `Ctrl+F` | Recherche dans la réponse |
| `Ctrl+/` | Formater le JSON de la requête |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+H` | Toggle historique |
| `Ctrl+L` | Toggle collections |
| `Escape` | Fermer les modales |

Les raccourcis sont désactivés automatiquement quand tu es dans un champ de saisie.

---

## 15. L'assistant IA

### C'est quoi ?

Un chatbot IA intégré qui peut :
- Analyser une réponse
- Générer des tests (Jest, fetch, curl)
- Convertir une description en langage naturel → requête
- Générer de la documentation

### Providers supportés

- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude)
- Google Gemini
- OpenRouter
- Ollama (local)
- DeepSeek

### Setup

1. Settings → **AI Configuration**
2. Choisis ton provider
3. Entre ta clé API
4. Sélectionne le modèle

### Exemple : analyser une réponse

1. Envoie une requête
2. Ouvre le panel AI (icône chat)
3. Demande : "Cette réponse est-elle valide ?"
4. L'IA analyse le JSON et répond

### Exemple : générer des tests

1. Ouvre une requête
2. Panel AI → "Generate tests for this endpoint"
3. L'IA propose des tests Jest, fetch, curl
4. Copie-colle dans ton runner ou sauvegarde dans la collection

### Exemple : langage naturel → requête

1. Panel AI → "Create a GET request to fetch all users with pagination"
2. L'IA propose :
   - Method: GET
   - URL: `{{baseUrl}}/users?page={{page}}&limit={{limit}}`
   - Headers, etc.
3. Applique à l'éditeur

---

## 16. L'app desktop Tauri

### C'est quoi ?

Reqly peut être packagé en application desktop native via Tauri (Rust + WebView). Bénéfices :
- Performances natives
- Accès au système de fichiers
- Notifications OS natives
- Tray icon
- Pas de dépendance au navigateur

### Lancer en dev

```bash
cd reqy-web
pnpm tauri:dev
```

Cela lance à la fois le frontend Next.js ET le backend Tauri.

### Build de production

```bash
cd reqy-web
pnpm tauri:build
```

Les binaires sont générés dans `reqy-web/src-tauri/target/release/bundle/` :
- macOS : `.app` et `.dmg`
- Windows : `.exe` et `.msi`
- Linux : `.AppImage` et `.deb`

### Différences web vs desktop

| Feature | Web | Desktop |
|---|---|---|
| File system access | ❌ | ✅ |
| Native notifications | ⚠️ (browser) | ✅ |
| Tray icon | ❌ | ✅ |
| Auto-update | ❌ | ✅ |
| Offline-first | ❌ | ✅ |

---

## 17. Architecture et debugging

### Architecture globale

```
┌─────────────────────────────────────────────────────┐
│ Browser (Next.js 16 + React 19)                       │
│                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ RequestPanel │  │ Collections  │  │ SyncBanner │  │
│  └──────────────┘  └──────────────┘  └────────────┘  │
│         │                  │                │         │
│         └──────────────────┼────────────────┘         │
│                            │                          │
│  ┌─────────────────────────▼─────────────────────┐  │
│  │  Zustand Stores (localStorage + cross-tab sync) │  │
│  │  Collections · Environments · History · Sync    │  │
│  └─────────────────────────┬─────────────────────┘  │
│                            │                          │
│  ┌─────────────────────────▼─────────────────────┐  │
│  │  Pure Logic Modules (test-runner, graphql,       │  │
│  │  openapi-inference, sdk-codegen, import-merge)  │  │
│  └───────────────────────────────────────────────┘  │
└─────────────┬────────────────────────────┬─────────┘
              │ HTTP (proxy)                │ WebSocket
              ▼                              ▼
┌─────────────────────────────────────────────────────┐
│ Sync Server (Hono + better-sqlite3 + ws)            │
│  Workspaces · Members · Collections · Environments  │
└─────────────────────────────────────────────────────┘
```

### Couches

1. **UI Components** (React) — présentation pure
2. **Zustand Stores** (state management) — état global, persistance localStorage
3. **Pure Logic** (TypeScript) — fonctions testables sans React
4. **HTTP Layer** (`fetch`) — communication serveur
5. **Sync Engine** — polling 30s + WebSocket push
6. **Server** (Hono + SQLite) — persistance multi-user

### Où sont stockées les données ?

| Donnée | Stockage |
|---|---|
| Collections | localStorage `reqly-request-store` |
| Environments | localStorage |
| History | localStorage (max 100) |
| Workspaces | localStorage (activeWorkspaceId) |
| Sync state | Zustand (in-memory) |
| Server-side (Cloud sync) | SQLite file (`sync-server/data/reqly-sync.db`) |

### Ouvrir les DevTools

- **Chrome/Edge** : F12
- **Firefox** : F12
- **Safari** : Cmd+Option+I
- **Tauri** : clic droit → Inspect

### Inspecter le state

Dans la console :
```javascript
// Voir tout le state
JSON.parse(localStorage.getItem("reqly-request-store"))

// Voir juste les collections
useRequestStore.getState().collections
```

### Logs utiles

- **Client** : ouvre la console navigateur, filtre par `[reqly]` ou `[sync]`
- **Server** : `pnpm dev` affiche les requêtes HTTP dans le terminal

### Reset complet

Si quelque chose est cassé :
```bash
# Effacer le localStorage (dans DevTools console)
localStorage.clear()
location.reload()

# Reset du serveur sync
rm sync-server/data/reqly-sync.db
```

### Où trouver quoi dans le code

| Tu cherches... | Regarde dans... |
|---|---|
| L'éditeur de requête | `reqy-web/components/request-panel.tsx` |
| La logique des assertions | `reqy-web/lib/test-runner/assertions.ts` |
| Le sandbox des scripts | `reqy-web/lib/test-runner/scripts.ts` |
| L'inférence OpenAPI | `reqy-web/lib/openapi-inference/` |
| Le générateur SDK | `reqy-web/lib/sdk-codegen/` |
| La résolution de conflits | `reqy-web/lib/import-merge/` |
| Le serveur sync | `sync-server/src/` |
| Le WebSocket sync | `sync-server/src/ws-hub.ts` + `reqy-web/hooks/use-sync-socket.ts` |
| La barre de sync | `reqy-web/components/sync-status-banner.tsx` |
| L'IA | `reqy-web/hooks/use-ai-engine.ts` |

### Tests

```bash
# Tests unitaires (rapides)
cd reqy-web && pnpm test

# Tests E2E (nécessitent dev server)
cd reqy-web && pnpm test:e2e

# Tests serveur sync
cd sync-server && pnpm test
```

### Variables d'environnement

| Variable | Usage |
|---|---|
| `AUTH_SIGNING_SECRET` | Secret HMAC pour signer les cookies de session (DOIT être identique client + serveur) |
| `NEXT_PUBLIC_SYNC_URL` | URL du serveur de sync (côté client uniquement) |
| `ALLOWED_ORIGIN` | Origines CORS autorisées (côté serveur) |
| `PORT` | Port du serveur sync (défaut 4000) |

### Commandes utiles

```bash
# Lancer tout
cd apiPlayground-main
pnpm install
cd reqy-web && pnpm dev &
cd sync-server && pnpm dev &

# Build de prod
cd reqy-web && pnpm build
cd reqy-web && pnpm start

# Tests + lint
cd reqy-web && pnpm test
cd reqy-web && pnpm lint
cd reqy-web && pnpm typecheck  # si disponible

# Voir la spec OpenAPI exportée
cd reqy-web && cat <collection>.yaml | less

# Générer un SDK depuis une spec
cd reqy-web && pnpm tsx scripts/run-collection.ts --collection ./my-collection.json
```

### Problèmes fréquents

| Problème | Solution |
|---|---|
| `pnpm install` échoue | Vérifier Node ≥ 20, supprimer `node_modules` et `pnpm-lock.yaml` |
| Port 3000 occupé | `PORT=3001 pnpm dev` |
| Tests E2E timeout | Lancer `pnpm dev` d'abord, attendre que la page soit ready |
| WebSocket ne se connecte pas | Vérifier `AUTH_SIGNING_SECRET` identique client/serveur |
| Le sandbox de script bloque | `Function()`, `eval()`, `require()` sont bloqués par sécurité |
| Le mock server E2E ne répond pas | Lancer `pnpm dev` avant les tests |

### Architecture d'un test E2E

```
tests/e2e/
├── fixtures/
│   ├── mock-server.ts        # Serveur HTTP local (port dynamique)
│   └── test-data.ts
├── helpers/
│   ├── page-objects.ts       # Sélecteurs data-testid
│   └── auth.ts
└── *.spec.ts                  # Tests par feature
```

Chaque spec suit le pattern :
```typescript
test.beforeAll(async () => { await startMockServer() })
test.afterAll(async () => { await stopMockServer() })

test("description", async ({ page }) => {
  await page.goto("/")
  await urlInput(page).fill(`${getMockBaseUrl()}/mock`)
  await sendButton(page).click()
  await expect(responseStatus(page)).toContainText(/200/)
})
```

---

## 🎯 Récapitulatif des features par catégorie

### Core
- ✅ Éditeur de requêtes REST (méthodes, headers, body, auth)
- ✅ Historique (100 entrées max)
- ✅ Collections + dossiers + drag & drop
- ✅ Environnements + variables `{{var}}`
- ✅ Onglets multiples par requête
- ✅ Raccourcis clavier

### Testing
- ✅ Collection Runner (séquentiel)
- ✅ 4 types d'assertions (status, time, jsonPath, schema)
- ✅ Pre/post scripts (sandbox sécurisé)
- ✅ Data-driven testing (CSV/JSON)
- ✅ Export JUnit XML
- ✅ CLI runner (scripts/run-collection.ts)
- ✅ E2E tests Playwright

### Protocols
- ✅ REST / GraphQL natif (queries + mutations + introspection)
- ❌ WebSocket, gRPC, MQTT, SOAP (non implémentés)

### API Documentation
- ✅ Export OpenAPI 3.0
- ✅ Inference depuis l'historique (allOf merge)
- ✅ Code-gen SDK TypeScript

### Collaboration
- ✅ Cloud sync multi-user (create, join, invite)
- ✅ Résolution de conflits LWW (côté serveur)
- ✅ Real-time WebSocket sync (latence <1s)
- ✅ Polling fallback (30s)

### DX
- ✅ Import/Export Postman + OpenAPI + JSON
- ✅ Merge avec résolution LWW (import/export local)
- ✅ Assistant IA (5 providers)
- ✅ Notifications + thème clair/sombre

### Platform
- ✅ Web (Next.js 16)
- ✅ Desktop (Tauri/Rust)
- ❌ CLI standalone (reqly-cli)
- ❌ Mobile

### Security
- ✅ Sessions HMAC signées
- ✅ Sandbox vm pour scripts
- ✅ SSRF protection (proxy)
- ❌ mTLS, SSO enterprise, vault de secrets

---

## 📚 Ressources

- **README.md** (racine) — vue d'ensemble du projet
- **TESTING-GUIDE.md** — guide de test rapide
- **.kimchi/docs/** — designs et plans détaillés :
  - `2025-06-21-fragilities-fix-design.md`
  - `2025-06-21-collection-runner-*` (étape 1)
  - `2025-06-21-step2a-graphql-openapi-design.md` (étape 2a)
  - `2025-06-21-step2b1-e2e-design.md` (étape 2b-i)
  - `2025-06-21-step2b2-cloud-sync-design.md` (étape 2b-ii)
  - `2025-06-21-import-export-merge-design.md` (recommandation #3)

---

**🎉 Tu as maintenant une vision complète de Reqly !** Explore, teste, casse des trucs, et fais du feedback. Tout est dans le code.
