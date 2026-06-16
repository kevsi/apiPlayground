# 🧪 Test Mock Server

Petits utilitaires pour tester le serveur mock de l'API Playground.

## 1. Page HTML interactive

Ouvre [`test-mock/index.html`](index.html) dans ton navigateur :

- **Requête rapide** — choisis méthode + URL et envoie
- **Routes enregistrées** — clique sur une route pour la tester
- **Tests rapides** — boutons pré-configurés

> 💡 Ouvre le fichier via `http://localhost:3001/test-mock/index.html` si le
> serveur est configuré pour servir des fichiers statiques, ou ouvre-le
> directement depuis le disque.

## 2. Script CLI (Node.js)

```bash
node test-mock/test-routes.mjs
```

Ce script va :
1. Lister les routes mock actives sur `http://localhost:3001`
2. Tester chaque route et afficher le résultat
3. Proposer de créer des routes factices si aucune n'existe

Les routes factices créées :

| Méthode | Chemin                  | Description             |
|---------|-------------------------|-------------------------|
| GET     | `/api/users`            | Liste d'utilisateurs    |
| GET     | `/api/users/:id`        | Utilisateur par ID      |
| POST    | `/api/users`            | Création utilisateur    |
| GET     | `/api/users/not-found`  | Erreur 404              |
| GET     | `/api/dashboard/stats`  | Stats dashboard (500ms) |

## Prérequis

- Serveur Next.js en cours d'exécution sur `http://localhost:3001`
- Routes mock créées (via `/mocks` ou via le script)
