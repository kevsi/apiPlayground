# recli

> The API testing CLI that wrecks Newman.  
> Assertions, scripts, chaining, GraphQL, snapshots, parallel — zero bloat.

```bash
npx recli run collection.json
```

---

## Table des matières

- [Installation](#installation)
- [Commandes](#commandes)
- [Collection format](#collection-format)
- [Assertions](#assertions)
- [JSON Schema](#json-schema)
- [Variable chaining](#variable-chaining)
- [Pre / Post scripts](#pre--post-response-scripts)
- [GraphQL](#graphql)
- [Cookie Jar](#cookie-jar)
- [Snapshot testing](#snapshot-testing)
- [Reporters](#reporters)
- [Dotenv](#dotenv)
- [Data-driven](#data-driven)
- [Config file](#config-file)
- [CI/CD](#cicd-github-actions)
- [Diff](#diff)
- [TUI mode](#tui-mode)
- [Multi-workspace](#multi-workspace)
- [Comparatif vs Newman](#comparatif-vs-newman)

---

## Installation

```bash
# Via npx (sans installation)
npx recli run collection.json

# Depuis le monorepo
git clone <repo>
cd apiPlayground-main
pnpm install
pnpm --dir recli build

# Binaire local
./recli/dist/index.js run collection.json

# Via pnpm exec
pnpm --dir recli exec recli run collection.json
```

Prérequis : **Node.js >= 18** (fetch natif).

---

## Commandes

```
recli run <files...>        Exécute une ou plusieurs collections
recli graphql <endpoint>    Exécute une requête GraphQL
recli validate <file>       Valide le format d'export
recli openapi <file>        Importe une spec OpenAPI
recli init [name]           Crée une collection vierge
recli export <file>         Exporte en commandes curl
recli watch <file>          Re-joue automatiquement au changement
recli diff <before> <after> Compare deux résultats
recli ui <file>             Interface interactive dans le terminal
```

### Options globales

| Option | Default | Description |
|---|---|---|
| `--env <name>` | — | Environnement à utiliser |
| `--timeout <ms>` | 30000 | Timeout par requête |
| `--no-color` | false | Désactive les couleurs |
| `--json` | false | Sortie NDJSON |
| `--parallel` | false | Exécution parallèle |
| `--delay <ms>` | 0 | Délai entre requêtes |
| `--iterations <n>` | 1 | Nombre d'itérations |
| `--data <file>` | — | Fichier de données (CSV/JSON) |
| `--reporter <format>` | cli | cli, json, junit, html |
| `--output <path>` | — | Fichier de rapport |
| `--snapshot` | false | Snapshot testing |
| `--update-snapshots` | false | Met à jour les snapshots |
| `--dotenv <file>` | — | Importe un fichier .env |

---

## Collection format

```json
{
  "version": "1.0",
  "collections": [
    {
      "name": "Users API",
      "description": "API de gestion des utilisateurs",
      "requests": [
        {
          "name": "Get User",
          "method": "GET",
          "url": "https://api.example.com/users/{{userId}}",
          "endpoint": "/users/:id",
          "headers": {
            "Authorization": "Bearer {{token}}"
          },
          "queryParams": [
            { "key": "include", "value": "posts" }
          ],
          "assert": [
            { "expr": "status == 200" },
            { "expr": "body.name != null" },
            { "expr": "duration < 1000" }
          ],
          "capture": [
            { "name": "userId", "expr": "body.id" }
          ],
          "scripts": {
            "pre": "vars.set('start', Date.now())",
            "post": "expect(response.json().email).toContain('@')"
          },
          "skip": false,
          "description": "Récupère un utilisateur par son ID"
        },
        {
          "name": "Login (GraphQL)",
          "method": "GRAPHQL",
          "url": "https://api.example.com/graphql",
          "bodyType": "graphql",
          "graphql": {
            "query": "mutation Login($email: String!, $pass: String!) { login(email: $email, password: $pass) { token user { id } } }",
            "variables": {
              "email": "user@example.com",
              "pass": "{{PASSWORD}}"
            },
            "operationName": "Login"
          }
        }
      ]
    }
  ],
  "environments": [
    {
      "name": "Production",
      "variables": [
        { "key": "baseUrl", "value": "https://api.example.com", "enabled": true }
      ]
    }
  ]
}
```

---

## Assertions

Syntaxe : `<field> <operator> <expected>`

### Champs

| Champ | Description | Exemple |
|---|---|---|
| `status` | Code HTTP | `status == 200` |
| `body.path.to.field` | Valeur JSON (dot notation) | `body.user.id == 1` |
| `body.items[0]` | Index de tableau | `body.items[0] == 'first'` |
| `body.items.length` | Taille d'un tableau | `body.items.length > 0` |
| `headers.header-name` | Valeur d'en-tête | `headers.content-type contains 'json'` |
| `duration` | Temps de réponse (ms) | `duration < 500` |

### Opérateurs

| Opérateur | Description |
|---|---|
| `==` | Égalité |
| `!=` | Différent |
| `>` / `<` / `>=` / `<=` | Comparaison numérique |
| `contains` | Contient (string, array, object) |

### Exemples

```
status == 201                          # created
status != 404                          # pas de not found
status >= 200 && status < 300          # success (comparaisons chaînées)
body.id == 42                          # champ simple
body.user.name == 'John'               # champ nested
body.items.length == 5                 # taille de tableau
body.items[0] == 'first'               # index
body.title != null                     # champ présent
headers.content-type contains 'json'   # header
duration < 1000                        # temps de réponse
```

---

## JSON Schema

Alternative aux assertions individuelles : valider toute la réponse contre un schéma JSON.

```json
{
  "assert": [
    {
      "name": "User schema",
      "schema": {
        "type": "object",
        "required": ["id", "name", "email"],
        "properties": {
          "id": { "type": "integer", "minimum": 1 },
          "name": { "type": "string", "minLength": 1 },
          "email": { "type": "string", "pattern": "^[a-z@.]+$" },
          "age": { "type": "integer", "minimum": 0, "maximum": 150 },
          "roles": {
            "type": "array",
            "items": { "type": "string" }
          }
        }
      }
    }
  ]
}
```

Types supportés : `string`, `number`, `integer`, `boolean`, `array`, `object`, `null`.

Contraintes supportées : `required`, `properties`, `items`, `enum`, `minimum`, `maximum`, `minLength`, `maxLength`, `pattern`, `nullable`, `oneOf`.

---

## Variable chaining

Capture une valeur de réponse et la réinjecte dans les requêtes suivantes.

```json
{
  "capture": [
    { "name": "token", "expr": "body.accessToken" },
    { "name": "userId", "expr": "body.user.id" },
    { "name": "contentType", "expr": "headers.content-type" }
  ]
}
```

Expressions de capture :

| Expression | Description |
|---|---|
| `body.field` | Valeur JSON |
| `body[0].id` | Index de tableau |
| `headers.header-name` | Valeur d'en-tête |
| `status` | Code HTTP |

La variable est ensuite disponible via `{{token}}` dans toutes les requêtes suivantes.

---

## Pre / Post response scripts

Scripts JavaScript exécutés dans un sandbox (module `vm` de Node.js).

### API disponible

| API | Description |
|---|---|
| `env.get(key)` | Lit une variable d'environnement |
| `env.set(key, value)` | Écrit une variable d'environnement |
| `env.unset(key)` | Supprime une variable |
| `vars.get(key)` | Lit une variable runtime |
| `vars.set(key, value)` | Écrit une variable runtime |
| `vars.unset(key)` | Supprime une variable |
| `request.method` | Méthode HTTP (lecture/écriture) |
| `request.url` | URL (lecture/écriture) |
| `request.headers` | Headers (lecture/écriture) |
| `request.body` | Body (lecture/écriture) |
| `request.setHeader(k, v)` | Ajoute un header |
| `request.setMethod(m)` | Change la méthode |
| `request.setUrl(u)` | Change l'URL |
| `request.setBody(b)` | Change le body |
| `response.status` | Code HTTP réponse (post uniquement) |
| `response.statusText` | Status text (post uniquement) |
| `response.headers` | Headers réponse (post uniquement) |
| `response.body` | Body brut (post uniquement) |
| `response.json()` | Body parsé JSON (post uniquement) |
| `response.text()` | Body en texte (post uniquement) |
| `expect(val).toBe(expected)` | Assertion |
| `expect(val).toEqual(expected)` | Assertion deep equal |
| `expect(val).toContain(str)` | String contains |
| `expect(val).toBeGreaterThan(n)` | Comparaison numérique |
| `expect(val).toBeLessThan(n)` | Comparaison numérique |
| `expect(val).toMatch(regex)` | Regex match |
| `console.log/warn/error/info` | Debug |

### Pre-request script

Modifie la requête avant envoi :

```js
// Lecture de variables
const token = env.get('AUTH_TOKEN')
const baseUrl = vars.get('baseUrl')

// Modification de la requête
request.setHeader('Authorization', 'Bearer ' + token)
request.setUrl(baseUrl + '/users/' + vars.get('userId'))
request.setBody(JSON.stringify({ timestamp: Date.now() }))
request.setMethod('POST')

// Variables dynamiques
vars.set('startTime', Date.now())
```

### Post-response script

Valide et extrait des données de la réponse :

```js
// Accès à la réponse
const data = response.json()
const status = response.status
const headers = response.headers

// Assertions
expect(status).toBe(200)
expect(data.id).toBeGreaterThan(0)
expect(data.email).toContain('@')
expect(data.name).toMatch(/^[A-Z]/)

// Capture dans l'environnement
env.set('userId', String(data.id))
env.set('token', data.token)

// Debug
console.log('User created:', data.id)
```

---

## GraphQL

### Commande directe

```bash
recli graphql https://api.example.com/graphql \
  --query "query Users { users { id name email } }"

# Avec variables
recli graphql https://api.example.com/graphql \
  --query "query User($id: ID!) { user(id: $id) { name } }" \
  --variables '{"id": "42"}' \
  --operation-name User
```

### Dans une collection

```json
{
  "name": "Get Users (GraphQL)",
  "method": "GRAPHQL",
  "url": "https://api.example.com/graphql",
  "graphql": {
    "query": "query GetUsers($page: Int) { users(page: $page) { id name email } }",
    "variables": { "page": 1 },
    "operationName": "GetUsers"
  },
  "assert": [
    { "expr": "status == 200" },
    { "expr": "body.data.users.length > 0" }
  ],
  "capture": [
    { "name": "firstUserId", "expr": "body.data.users[0].id" }
  ]
}
```

Le `method: "GRAPHQL"` est transformé automatiquement en POST avec le body JSON `{ query, variables, operationName }`.

---

## Cookie Jar

Les cookies sont automatiquement gérés entre les requêtes.

```json
[
  {
    "name": "Login",
    "method": "POST",
    "url": "https://api.example.com/login",
    "body": "{\"user\":\"admin\",\"pass\":\"secret\"}"
  },
  {
    "name": "Get Profile",
    "method": "GET",
    "url": "https://api.example.com/profile"
  }
]
```

Le `Set-Cookie` du login est automatiquement renvoyé dans la requête suivante. Les cookies sont également exposés dans le résultat :

```json
"responseCookies": {
  "sessionId": "abc123",
  "csrfToken": "xyz789"
}
```

---

## Snapshot testing

Capture la réponse comme référence et détecte les régressions.

```bash
# Premier run : crée les snapshots
recli run collection.json --snapshot

# Run suivant : compare avec les snapshots
recli run collection.json --snapshot
# → "Snapshot changed" si la réponse diffère

# Met à jour les snapshots
recli run collection.json --update-snapshots
```

Les snapshots sont stockés dans `.recli-snapshots/` à côté de la collection. Le nom de chaque snapshot correspond au nom de la requête.

---

## Reporters

### CLI (défaut)

```
✓ GET    https://api.example.com/users    200   340ms
  ✓ Status is 200
  ✓ User ID is valid
  → captured {{userId}} = 42
```

### JSON (NDJSON)

```bash
recli run collection.json --reporter json
# Une ligne JSON par requête, compatible CI
```

### JUnit

```bash
recli run collection.json --reporter junit --output report.xml
# Intégrable dans Jenkins, GitLab CI, GitHub Actions
```

### HTML

```bash
recli run collection.json --reporter html --output report.html
# Rapport autonome avec thème dark, téléchargeable dans un artifact CI
```

---

## Dotenv

Charge automatiquement les variables d'un fichier `.env` :

```bash
recli run collection.json --dotenv .env.local
```

Format supporté (standard `dotenv`) :

```ini
API_URL=https://api.example.com
API_KEY=sk-abc123
DB_PASSWORD=secret
```

Les variables sont ensuite disponibles via `{{API_URL}}` et `env.get('API_KEY')`.

---

## Data-driven

Exécute la collection plusieurs fois avec des données différentes.

```bash
# CSV
recli run collection.json --data users.csv

# JSON
recli run collection.json --data users.json

# Avec itérations explicites
recli run collection.json --data data.csv --iterations 5
```

Format CSV :
```csv
userId,name,email
1,Alice,alice@test.com
2,Bob,bob@test.com
3,Charlie,charlie@test.com
```

Format JSON :
```json
[
  { "userId": "1", "name": "Alice", "email": "alice@test.com" },
  { "userId": "2", "name": "Bob", "email": "bob@test.com" }
]
```

Les champs sont accessibles via `{{userId}}`, `{{name}}`, etc. dans la collection.

---

## Config file

Recli cherche automatiquement un fichier de configuration en remontant l'arborescence depuis le dossier courant.

Fichiers détectés (par ordre de priorité) :
- `.reclirc` (format JSON ou key=value)
- `.reclirc.json`
- `recli.config.json`
- `.reclirc.yaml`

```ini
# .reclirc  (format key=value)
env=staging
timeout=15000
parallel=true
reporter=html
output=report.html
iterations=3
snapshot=true
```

```json
// recli.config.json
{
  "env": "production",
  "timeout": 30000,
  "parallel": true,
  "reporter": "junit",
  "output": "reports/recli.xml",
  "dotenv": ".env.prod"
}
```

```yaml
# .reclirc.yaml
env: development
timeout: 10000
parallel: false
reporter: cli
```

---

## CI/CD (GitHub Actions)

### Via l'action composite

```yaml
name: API Tests
on: [push]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: recli/recli-action@v1
        with:
          collection: tests/collection.json
          env: CI
          reporter: junit
          output: recli-report.xml
          parallel: true
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: api-test-report
          path: recli-report.xml
```

### Via npx direct

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npx recli run tests/collection.json --reporter junit --output report.xml --env CI
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-report
          path: report.xml
```

---

## Diff

Compare deux fichiers de résultats pour détecter les régressions :

```bash
# Générer deux rapports
recli run collection.json --reporter json -o avant.json
# ... modifier le code ...
recli run collection.json --reporter json -o apres.json

# Comparer
recli diff avant.json apres.json
```

Sortie :
```
Diff Report (3 requests)

= Get User
   https://api.example.com/users/1
   status: 200 (unchanged)

~ Create User
   https://api.example.com/users
   status: 201 → 500
   body:   changed
   time:   340ms → 1200ms
   result: pass → fail

= Delete User
   https://api.example.com/users/42
   status: 204 (unchanged)

1 changed, 2 unchanged
```

---

## TUI mode

Interface interactive dans le terminal :

```bash
recli ui collection.json
```

Navigation :
- `1`, `2`, `3`... → Exécute une requête spécifique
- `a` → Exécute toutes les requêtes
- `q` → Quitte

Chaque requête affiche son status, body et headers dans une vue dédiée.

---

## Multi-workspace

Exécute plusieurs collections en une seule commande :

```bash
recli run auth.json users.json posts.json

# Rapport unique pour toutes les collections
recli run auth.json users.json --reporter junit --output rapport.xml
```

---

## Comparatif vs Newman

| Feature | recli | Newman |
|---|---|---|
| Status assertions | ✅ `status == 200` | ✅ |
| Body/JSONPath assertions | ✅ `body.user.id != null` | ✅ (PM API) |
| Header assertions | ✅ `headers.x contains 'json'` | ✅ |
| Duration assertions | ✅ `duration < 500` | ✅ |
| JSON Schema validation | ✅ `schema: { type, properties }` | ❌ |
| Pre-request scripts | ✅ Sandbox `vm`, expect API | ✅ |
| Post-response scripts | ✅ Sandbox `vm`, expect API | ✅ |
| Variable chaining | ✅ capture → `{{var}}` | ✅ |
| **GraphQL natif** | ✅ `recli graphql` | ❌ |
| **Parallélisme** | ✅ `--parallel` | ❌ (payant) |
| **Snapshot testing** | ✅ `--snapshot` | ❌ |
| **Cookie Jar** | ✅ Automatique | ❌ |
| **Dotenv import** | ✅ `--dotenv .env` | ❌ |
| **Config file** | ✅ `.reclirc` auto-détecté | ❌ |
| **Watch mode** | ✅ `recli watch` | ❌ |
| **OpenAPI import** | ✅ `recli openapi` | ❌ |
| **Response diff** | ✅ `recli diff` | ❌ |
| **TUI interactif** | ✅ `recli ui` | ❌ |
| **Multi-workspace** | ✅ `recli run a.json b.json` | ✅ |
| Data-driven | ✅ CSV/JSON | ✅ |
| JUnit / HTML / CLI reporters | ✅ | ✅ |
| Export curl | ✅ | ✅ |
| Taille install | ~200KB | ~200MB |
| Dépendances HTTP runtime | 0 (native fetch) | axios + lourdes |

---

## Licence

MIT — Fait pour casser Newman, pas pour prendre son argent.
