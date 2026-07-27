# Guide de vérification fonctionnelle — Reqly

## APIs utilisées dans ce guide

| API             | URL de base                               | Auth       | Idéal pour                           |
| --------------- | ----------------------------------------- | ---------- | ------------------------------------ |
| JSONPlaceholder | `https://jsonplaceholder.typicode.com`    | ❌ Non     | CRUD, GET/POST/PUT/PATCH/DELETE      |
| ReqRes          | `https://reqres.in`                       | ❌ Non     | Pagination, délais, erreurs simulées |
| PokéAPI         | `https://pokeapi.co/api/v2`               | ❌ Non     | Données imbriquées, relations        |
| REST Countries  | `https://restcountries.com/v3.1`          | ❌ Non     | Paramètres, champs filtrés           |
| OpenWeatherMap  | `https://api.openweathermap.org/data/2.5` | ✅ API Key | Auth API Key, variables d'env        |
| Rick and Morty  | `https://rickandmortyapi.com/api`         | ❌ Non     | Pagination+relations                 |
| Open-Meteo      | `https://api.open-meteo.com/v1`           | ❌ Non     | Query params complexes               |

---

## 1. Requêtes HTTP de base (GET, POST, PUT, PATCH, DELETE)

### 1.1 GET — Récupérer des posts

**Dans Reqly :**

- Méthode : `GET`
- URL : `https://jsonplaceholder.typicode.com/posts`
- Headers : aucun
- Body : aucun

**Résultat attendu :**

```
Status: 200 OK
Body: un tableau JSON de 100 posts
  [
    {
      "userId": 1,
      "id": 1,
      "title": "sunt aut facere repellat provident occaecati excepturi optio reprehenderit",
      "body": "quia et suscipit..."
    },
    ...
  ]
Response Headers: content-type: application/json; charset=utf-8
```

### 1.2 GET avec ID — Récupérer un post spécifique

- Méthode : `GET`
- URL : `https://jsonplaceholder.typicode.com/posts/1`

**Résultat attendu :**

```
Status: 200 OK
Body: un objet unique
{
  "userId": 1,
  "id": 1,
  "title": "sunt aut facere...",
  "body": "quia et suscipit..."
}
```

### 1.3 POST — Créer une ressource

- Méthode : `POST`
- URL : `https://jsonplaceholder.typicode.com/posts`
- Headers : `Content-Type: application/json`
- Body (JSON) :

```json
{
  "title": "Mon nouveau post",
  "body": "Contenu du post",
  "userId": 1
}
```

**Résultat attendu :**

```
Status: 201 Created
Body: l'objet créé avec un id généré
{
  "title": "Mon nouveau post",
  "body": "Contenu du post",
  "userId": 1,
  "id": 101
}
```

### 1.4 PUT — Remplacer complètement

- Méthode : `PUT`
- URL : `https://jsonplaceholder.typicode.com/posts/1`
- Headers : `Content-Type: application/json`
- Body :

```json
{
  "id": 1,
  "title": "Titre modifié",
  "body": "Contenu modifié",
  "userId": 1
}
```

**Résultat attendu :**

```
Status: 200 OK
Body: l'objet remplacé
```

### 1.5 PATCH — Mise à jour partielle

- Méthode : `PATCH`
- URL : `https://jsonplaceholder.typicode.com/posts/1`
- Headers : `Content-Type: application/json`
- Body :

```json
{
  "title": "Seulement le titre changé"
}
```

**Résultat attendu :**

```
Status: 200 OK
Body: l'objet avec seulement le titre modifié
{
  "userId": 1,
  "id": 1,
  "title": "Seulement le titre changé",
  "body": "quia et suscipit..."  // inchangé
}
```

### 1.6 DELETE — Supprimer

- Méthode : `DELETE`
- URL : `https://jsonplaceholder.typicode.com/posts/1`

**Résultat attendu :**

```
Status: 200 OK
Body: {} (objet vide)
```

---

## 2. Query Parameters

### 2.1 Pagination avec ReqRes

- Méthode : `GET`
- URL : `https://reqres.in/api/users?page=2`

**Résultat attendu :**

```
Status: 200 OK
Body:
{
  "page": 2,
  "per_page": 6,
  "total": 12,
  "total_pages": 2,
  "data": [
    {
      "id": 7,
      "email": "michael.lawson@reqres.in",
      "first_name": "Michael",
      "last_name": "Lawson",
      "avatar": "https://reqres.in/img/faces/7-image.jpg"
    },
    ...
  ]
}
```

**À vérifier dans Reqly :**

- Les paramètres query sont bien envoyés (onglet "Params" ou "Query")
- L'URL s'affiche correctement avec `?page=2`
- La réponse est bien formatée (coloration JSON)

### 2.2 Paramètres multiples

- Méthode : `GET`
- URL : `https://restcountries.com/v3.1/name/benin?fullText=true`

**Résultat attendu :**

```
Status: 200 OK
Body: un tableau avec 1 objet (Bénin)
{
  "name": {
    "common": "Benin",
    "official": "Republic of Benin",
    ...
  },
  "capital": ["Porto-Novo"],
  "region": "Africa",
  "population": 12123198,
  "flags": {
    "png": "https://flagcdn.com/w320/bj.png",
    "svg": "https://flagcdn.com/bj.svg"
  }
}
```

### 2.3 Paramètres météo complexes

- Méthode : `GET`
- URL : `https://api.open-meteo.com/v1/forecast?latitude=6.36&longitude=2.42&current_weather=true&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m&timezone=auto`

**Résultat attendu :**

```
Status: 200 OK
Body:
{
  "latitude": 6.36,
  "longitude": 2.42,
  "generationtime_ms": ...
  "current_weather": {
    "temperature": 28.5,     // température actuelle à Cotonou
    "windspeed": 12.3,
    "winddirection": 180,
    "weathercode": 1,
    "time": "2026-07-26T..."
  },
  "hourly": {
    "time": [...],
    "temperature_2m": [...],
    "relative_humidity_2m": [...],
    "wind_speed_10m": [...]
  }
}
```

---

## 3. Headers

### 3.1 Headers personnalisés

- Méthode : `GET`
- URL : `https://jsonplaceholder.typicode.com/posts/1`
- Headers :
  - `Accept: application/json`
  - `X-Custom-Header: test-reqly`
  - `User-Agent: Reqly-Test/1.0`

**Résultat attendu :**

```
Status: 200 OK
Body: le post numéro 1
```

**À vérifier dans Reqly :**

- Les headers sont visibles dans l'onglet "Headers" de la requête
- La réponse montre les headers reçus (content-type, etc.)

### 3.2 Headers de Content-Type

- Méthode : `POST`
- URL : `https://jsonplaceholder.typicode.com/posts`
- Headers : `Content-Type: application/x-www-form-urlencoded`
- Body (URL-encoded) : `title=Test&body=Contenu&userId=1`

**Résultat attendu :**

```
Status: 201 Created
```

**À vérifier :** Reqly envoie-t-il le bon Content-Type ? Le body est-il correctement formaté ?

---

## 4. Authentification

### 4.1 Bearer Token (simulé avec ReqRes)

ReqRes accepte un token Bearer même s'il ne le valide pas :

- Méthode : `GET`
- URL : `https://reqres.in/api/users/2`
- Auth : `Bearer Token`
- Token : `test-token-reqly`

**Résultat attendu :**

```
Status: 200 OK
Body:
{
  "data": {
    "id": 2,
    "email": "janet.weaver@reqres.in",
    "first_name": "Janet",
    "last_name": "Weaver",
    "avatar": "https://reqres.in/img/faces/2-image.jpg"
  },
  "support": {
    "url": "https://reqres.in/#support-heading",
    "text": "To keep ReqRes free..."
  }
}
```

**À vérifier dans Reqly :**

- L'onglet Auth est présent
- Choisir "Bearer Token" et entrer le token
- Le header `Authorization: Bearer test-token-reqly` est bien envoyé
- La réponse arrive normalement

---

## 5. Path Variables

### 5.1 Variable simple

**Configuration :**

1. Créer une variable d'environnement :
   - Clé : `BASE_URL`
   - Valeur : `https://jsonplaceholder.typicode.com`
2. Créer une variable de collection/workspace :
   - Clé : `POST_ID`
   - Valeur : `1`

**Requête :**

- Méthode : `GET`
- URL : `{{BASE_URL}}/posts/{{POST_ID}}`

**Résultat attendu :**

```
Status: 200 OK
Body: le post avec id=1
```

### 5.2 Variables imbriquées

**Configuration :**

- Variables :
  - `BASE_URL` = `https://jsonplaceholder.typicode.com`
  - `RESSOURCE` = `posts`
  - `ID` = `5`

**Requête :**

- Méthode : `GET`
- URL : `{{BASE_URL}}/{{RESSOURCE}}/{{ID}}`

**Résultat attendu :**

```
Status: 200 OK
Body: le post avec id=5

{
  "userId": 1,
  "id": 5,
  "title": "nesciunt quas odio",
  "body": "repudiandae veniam quaerat sunt sed..."
}
```

**À vérifier dans Reqly :**

- Le champ URL montre-t-il la substitution en temps réel ?
- Les variables sont-elles surlignées ?
- Changer `ID` à `3` et renvoyer → le post 3 apparaît

### 5.3 Variables dans les headers

**Configuration :**

- Variable : `AUTH_TOKEN` = `test123`
- URL : `https://reqres.in/api/users`
- Header : `Authorization: Bearer {{AUTH_TOKEN}}`

**Résultat attendu :**

```
Status: 200 OK  (ReqRes ne valide pas le token mais l'accepte)
```

---

## 6. Environnements

### Configuration d'environnement

1. Aller dans l'onglet "Environnements" (ou sidebar)
2. Créer "Production" :
   - `BASE_URL` = `https://jsonplaceholder.typicode.com`
   - `API_KEY` = `<vide>`
3. Créer "Dev" :
   - `BASE_URL` = `https://jsonplaceholder.typicode.com`
   - `API_KEY` = `dev-key`

**Test :**

- Méthode : `GET`
- URL : `{{BASE_URL}}/posts`
- Changer d'environnement → l'URL ne change pas (même base URL)
- Ajouter une variable différente entre les deux envs et vérifier la substitution

---

## 7. Réponse — Vérification visuelle

### 7.1 Statut HTTP

**Requête :** `GET https://httpstat.us/200`
**Résultat :** Status 200

**Requête :** `GET https://httpstat.us/404`
**Résultat :** Status 404

**Requête :** `GET https://httpstat.us/500`
**Résultat :** Status 500

**Requête :** `GET https://httpstat.us/301`
**Résultat :** Status 301 (redirection)

**À vérifier dans Reqly :**

- Le code statut s'affiche avec sa couleur (vert 2xx, orange 3xx, rouge 4xx/5xx)
- Le texte du statut est lisible ("200 OK", "404 Not Found")

### 7.2 Corps de réponse formaté

**Requête :** `GET https://jsonplaceholder.typicode.com/posts/1`

**À vérifier :**

- Le body JSON est colorisé
- On peut réduire/développer les objets (fold)
- Le copier-coller d'une partie du JSON fonctionne
- La taille de la réponse est affichée (ex: "3.2 KB")

### 7.3 Headers de réponse

- Après la requête ci-dessus, vérifier l'onglet "Response Headers"
- On doit voir : `content-type`, `x-ratelimit-limit`, `x-ratelimit-remaining`, etc.

---

## 8. Tests et Assertions (key-value, pas de code)

**⚠️ Important :** Le système de tests dans Reqly est un **système à clé-valeur**, pas un éditeur de code JavaScript. Tu ne peux PAS écrire de scripts `pm.test()` comme dans Postman. Tu configures des assertions avec des dropdowns et des champs de texte.

### 8.1 Onglet "Assertions" (nouveau système)

Dans le panneau de requête, il y a une section **"Assertions"** avec des rangées clé-valeur :

| Champ        | Type              | Exemple                                      |
| ------------ | ----------------- | -------------------------------------------- |
| **Type**     | Dropdown          | `Status`, `Time`, `JSON Path`, `Schema`      |
| **Target**   | Texte             | `200` (pour status), `$.id` (pour JSON Path) |
| **Expected** | Texte (optionnel) | `1` (valeur attendue)                        |
| **Enabled**  | Switch            | Activé/désactivé                             |

### 8.2 Assertion Status

**Requête :** `GET https://jsonplaceholder.typicode.com/posts/1`

**Configuration :**

- Type : `Status`
- Valeur : `200`

**Résultat attendu :**

- Le test passe ✅
- La couleur du badge de statut passe en vert

### 8.3 Assertion JSON Path

**Requête :** `GET https://jsonplaceholder.typicode.com/posts/1`

**Configuration :**

- Type : `JSON Path`
- Path : `$.id`
- Operator : `equals`
- Valeur : `1`

**Résultat attendu :**

- L'assertion passe ✅ — le champ `id` du JSON est bien égal à `1`

**Autres tests JSON Path :**

- Path: `$.title`, Operator: `contains`, Valeur: `sunt` → passe si le titre contient "sunt"
- Path: `$.userId`, Operator: `exists` → passe si userId existe
- Path: `$.body`, Operator: `notExists` → passe seulement si body n'existe pas

### 8.4 Assertion Response Time

**Requête :** `GET https://jsonplaceholder.typicode.com/posts`

**Configuration :**

- Type : `Time`
- Operator : `<`
- Valeur : `3000` (ms)

**Résultat attendu :**

- L'assertion passe ✅ si la réponse arrive en moins de 3 secondes

### 8.5 Assertion Schema

**Requête :** `GET https://jsonplaceholder.typicode.com/posts/1`

**Configuration :**

- Type : `Schema`
- Schema : `{"type": "object"}`

**Résultat attendu :**

- Passe si la réponse est un objet JSON (pas un tableau, pas une string)

### 8.6 Résultats des tests

Après avoir envoyé la requête :

1. Aller dans l'onglet **"Test Results"** de la réponse
2. Chaque assertion est listée avec :
   - ✅ Vert = passé
   - ❌ Rouge = échoué
   - ⏳ Gris = pas encore évalué

---

## 9. Scripts Pre-request

### 9.1 Générer un timestamp

**Onglet "Pre-request Script" :**

```javascript
// Générer un timestamp et le mettre en variable
const now = Date.now();
pm.variables.set("TIMESTAMP", now.toString());

// Logger
console.log("Timestamp généré:", now);
```

**Requête :** `POST https://jsonplaceholder.typicode.com/posts`

**Body :**

```json
{
  "title": "Test à {{TIMESTAMP}}",
  "body": "Créé à {{TIMESTAMP}}",
  "userId": 1
}
```

**Résultat attendu :** Le titre contient le timestamp généré par le script.

### 9.2 Modifier un header avant l'envoi

```javascript
// Ajouter un header de tracking
pm.request.headers.add({
  key: "X-Requested-At",
  value: new Date().toISOString(),
});
```

**Résultat attendu :** Le header `X-Requested-At` est présent dans la requête envoyée.

---

## 10. Scripts Post-response

### 10.1 Extraire une valeur et la stocker

**Requête :** `GET https://jsonplaceholder.typicode.com/posts/1`

**Script Post-response :**

```javascript
// Stocker l'ID du post pour une requête suivante
const jsonData = pm.response.json();
pm.environment.set("LAST_POST_ID", jsonData.id.toString());
pm.environment.set("LAST_POST_TITLE", jsonData.title);
```

**Vérification :** Les variables `LAST_POST_ID` et `LAST_POST_TITLE` sont créées.

### 10.2 Chaînage de requêtes

**Étape 1 :** Créer un post

- Méthode : `POST`
- URL : `https://jsonplaceholder.typicode.com/posts`
- Body :

```json
{
  "title": "Post créé pour test chaînage",
  "body": "Ce post sera utilisé ensuite",
  "userId": 1
}
```

- Script post-response :

```javascript
const jsonData = pm.response.json();
pm.environment.set("NEW_POST_ID", jsonData.id.toString());
```

**Étape 2 :** Récupérer le post créé

- Méthode : `GET`
- URL : `https://jsonplaceholder.typicode.com/posts/{{NEW_POST_ID}}`

**Résultat attendu :** La deuxième requête utilise l'ID généré par la première.

---

## 11. Snapshots

### 11.1 Sauvegarder une réponse

1. Faire `GET https://jsonplaceholder.typicode.com/posts/1`
2. Une fois la réponse reçue, cliquer sur "Save Snapshot" (ou icône appareil photo)
3. Donner un nom : "Post 1 - réponse OK"

**Vérification :**

- Le snapshot apparaît dans l'historique/l'onglet Snapshots
- La date et le statut (200) sont visibles
- En cliquant, on peut voir la réponse complète sauvegardée

### 11.2 Restaurer un snapshot

1. Aller dans la liste des snapshots
2. Cliquer sur "Post 1 - réponse OK"
3. La réponse sauvegardée s'affiche intégralement

### 11.3 Renommer un snapshot

1. Faire un clic droit (ou menu contextuel) sur un snapshot
2. Choisir "Rename"
3. Nouveau nom : "Post 1 - Vérifié le 26/07"

**Vérification :** Le nom est mis à jour dans la liste.

---

## 12. Collections

### 12.1 Créer une collection

1. Dans la sidebar, cliquer "New Collection"
2. Nom : `Reqly Test Suite`
3. Description : `Collection de test pour valider Reqly`

### 12.2 Ajouter des requêtes à la collection

1. Ajouter sous `Reqly Test Suite` :
   - `GET Posts` → `GET https://jsonplaceholder.typicode.com/posts`
   - `GET Post 1` → `GET https://jsonplaceholder.typicode.com/posts/1`
   - `Create Post` → `POST https://jsonplaceholder.typicode.com/posts`
   - `Delete Post` → `DELETE https://jsonplaceholder.typicode.com/posts/1`

### 12.3 Créer des dossiers

1. Dans `Reqly Test Suite`, créer un dossier :
   - `Utilisateurs` avec :
     - `GET Users` → `GET https://jsonplaceholder.typicode.com/users`
     - `GET User 1` → `GET https://jsonplaceholder.typicode.com/users/1`
   - `Posts` avec :
     - Les requêtes Post ci-dessus

### 12.4 Déplacer une requête

1. Glisser-déposer `GET Post 1` du dossier `Posts` vers `Utilisateurs`
2. Vérifier : la requête est maintenant sous `Utilisateurs`

---

## 13. Import/Export

### 13.1 Importer une collection Postman

Créer un fichier `reqly-test.postman_collection.json` :

```json
{
  "info": {
    "name": "Reqly Import Test",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Get Users",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "https://jsonplaceholder.typicode.com/users",
          "protocol": "https",
          "host": ["jsonplaceholder", "typicode", "com"],
          "path": ["users"]
        }
      }
    },
    {
      "name": "Create User",
      "request": {
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json" }],
        "body": {
          "mode": "raw",
          "raw": "{\"name\":\"Test User\",\"username\":\"test\",\"email\":\"test@example.com\"}"
        },
        "url": {
          "raw": "https://jsonplaceholder.typicode.com/users",
          "protocol": "https",
          "host": ["jsonplaceholder", "typicode", "com"],
          "path": ["users"]
        }
      }
    }
  ]
}
```

**Dans Reqly :**

1. Menu → Import → Postman Collection
2. Sélectionner le fichier
3. Vérifier : les 2 requêtes apparaissent dans une nouvelle collection

### 13.2 Importer une spécification OpenAPI

Utiliser cette spec minimale :

```yaml
openapi: 3.0.0
info:
  title: API Test
  version: 1.0.0
paths:
  /posts:
    get:
      summary: Liste des posts
      responses:
        "200":
          description: OK
  /posts/{id}:
    get:
      summary: Un post
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
      responses:
        "200":
          description: OK
```

**Vérification :**

- Les endpoints sont importés correctement
- Les path parameters (`id`) sont reconnus

### 13.3 Importer une requête cURL

```bash
curl -X POST https://jsonplaceholder.typicode.com/posts \
  -H "Content-Type: application/json" \
  -d '{"title":"curl import","body":"test","userId":1}'
```

**Dans Reqly :**

1. Copier la commande cURL
2. Menu → Import → cURL (ou coller directement dans la barre d'URL)
3. Vérifier : méthode POST, URL, headers, body tout est repris

---

## 14. GraphQL

### 14.1 Requête GraphQL simple

**Configuration :**

- URL : `https://rickandmortyapi.com/graphql`
- Méthode : `POST`
- Headers : `Content-Type: application/json`

**Body GraphQL (en mode "GraphQL" ou body JSON) :**

```json
{
  "query": "query { character(id: 1) { name status species origin { name } } }"
}
```

**Résultat attendu :**

```json
{
  "data": {
    "character": {
      "name": "Rick Sanchez",
      "status": "Alive",
      "species": "Human",
      "origin": {
        "name": "Earth (C-137)"
      }
    }
  }
}
```

### 14.2 GraphQL avec variables

```json
{
  "query": "query GetCharacter($id: ID!) { character(id: $id) { name episode { name } } }",
  "variables": {
    "id": "2"
  }
}
```

**Résultat attendu :**

```json
{
  "data": {
    "character": {
      "name": "Morty Smith",
      "episode": [
        { "name": "Pilot" },
        { "name": "Lawnmower Dog" },
        ...
      ]
    }
  }
}
```

---

## 15. Proxy

### 15.1 Test de base du proxy

Si Reqly a un endpoint proxy (`/api/proxy`) :

**Requête vers le proxy Reqly :**

- Méthode : `POST`
- URL : `https://app.reqly.dev/api/proxy` (ou localhost:3000)
- Body :

```json
{
  "method": "GET",
  "url": "https://jsonplaceholder.typicode.com/posts/1"
}
```

**Résultat attendu :** La réponse du proxy doit contenir le body, status et headers de la cible.

---

## 16. Page SSE (Server-Sent Events)

### 16.1 Connexion SSE

**Dans l'interface SSE de Reqly :**

- URL : `https://sse.example.com/events` (ou utiliser un endpoint SSE public)
- Sinon, tester avec un stream factice : `https://jsonplaceholder.typicode.com/posts/1`
  (ne sera pas un vrai SSE mais permet de voir l'interface)

**Vérifications :**

- Le bouton "Connect" / "Disconnect" fonctionne
- Les événements reçus s'affichent dans l'ordre
- Le compteur d'événements est mis à jour

---

## 17. Capture HTTP

### Activation de la capture

1. Aller dans la page "Capture" de Reqly
2. Configurer un port d'écoute (ex: 8080)
3. Démarrer la capture

**Test :**

```bash
# Dans un terminal
curl -X GET http://localhost:8080/ -H "Host: jsonplaceholder.typicode.com"
```

**Vérification :** La requête apparaît dans la liste des captures Reqly.

---

## Tableau de bord final

| Feature               | Statut | Notes |
| --------------------- | ------ | ----- |
| GET simple            | ⬜     |       |
| GET avec params       | ⬜     |       |
| POST avec body        | ⬜     |       |
| PUT/PATCH/DELETE      | ⬜     |       |
| Path variables        | ⬜     |       |
| Environnements        | ⬜     |       |
| Headers               | ⬜     |       |
| Auth Bearer           | ⬜     |       |
| Tests/Assertions      | ⬜     |       |
| Scripts pre-request   | ⬜     |       |
| Scripts post-response | ⬜     |       |
| Snapshots             | ⬜     |       |
| Collections/Dossiers  | ⬜     |       |
| Import Postman        | ⬜     |       |
| Import cURL           | ⬜     |       |
| Import OpenAPI        | ⬜     |       |
| GraphQL               | ⬜     |       |
| SSE                   | ⬜     |       |
| Capture HTTP          | ⬜     |       |
| Proxy                 | ⬜     |       |

Coche chaque case au fur et à mesure de ta vérification. Tu veux qu'on commence par un feature en particulier ?
