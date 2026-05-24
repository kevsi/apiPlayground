# Reqly — Statut du projet

## ✅ Fonctionnalités implémentées

### 1. Testeur d'API principal
- Interface de requête HTTP avec méthode, URL, headers, query params, body et authentification.
- Envoi des requêtes via une API proxy `app/api/proxy/route.ts` pour contourner les restrictions CORS.
- Affichage de la réponse dans un panneau de résultats avec statut, durée, taille, headers et corps.
- Historique des requêtes stocké en localStorage et affiché dans un panneau dédié.
- Possibilité de rejouer une requête depuis l'historique.

### 2. Stockage et persistance
- `hooks/use-request-store.ts` centralise : historique, collections, environnements, notifications, mappings de variables et projets.
- Persistance locale via `localStorage` avec fallback et migration simple.
- Événement global `reqly-store-update` pour synchroniser le store entre composants.

### 3. Dashboard Analytics
- `app/dashboard/page.tsx` affiche des métriques basiques : requêtes totales, temps de réponse moyen, taux de succès, endpoints actifs.
- Graphiques de volume des requêtes sur 7 jours et endpoints les plus lents.
- Analyse de santé des endpoints selon les derniers statuts.

### 4. Collections et export OpenAPI
- Création, suppression, renommage de collections de requêtes.
- Ajout / suppression de requêtes dans une collection.
- Export OpenAPI 3.0 fonctionnel depuis les collections de requêtes.

### 5. Notifications
- Notifications internes capture les événements important du store.
- Interface de notifications dans l'en-tête avec marquage des éléments lus.
- Bouton de permission pour activer les notifications système depuis le navigateur.

### 6. Assistant IA
- Interface de chat IA et génération de requêtes ou de tests.
- Backend IA `app/api/proxy-ai/route.ts` supportant Anthropic, OpenAI, OpenRouter, Gemini et Ollama.
- Prise en charge des endpoints OpenAI compatibles via un champ Base URL, par exemple `https://api.g0i.ai/v1`.
- Stockage de la configuration provider et clé API localement.
- Génération de tests automatiquement formatés (Jest / fetch / curl) à partir d'une requête historique.

### 7. UI globale et contrôles
- Sidebar de navigation entre Dashboard, API Endpoints, Collections, Projets, AI et Settings.
- Composants UI réutilisables (`Button`, `Select`, `Dialog`, `Drawer`, etc.).
- Thèmes et responsive layout de base.

## ⚠️ Fonctionnalités partiellement implémentées / à renforcer

### 1. Chaining de requêtes
- Le modal de mapping existe et peut extraire une valeur JSON d'une réponse.
- Ce système reste fragile : extraction basée sur `JSON.parse` + chemin string, sans validation avancée.
- Les variables ne sont pas testées en profondeur contre les réponses non-JSON ou les chemins invalides.

### 2. Collections vers éditeur principal
- La page Collections peut afficher et gérer des requêtes.
- Mais la sélection d'une requête depuis les collections ne charge pas proprement la requête dans l'éditeur principal.
- Le flux d'intégration entre Collections et l'espace de test doit être renforcé.

### 3. Import / export / sync d'équipe
- Un composant d'import/export est présent (`ImportExportModal`, `CollectionsPanel`).
- Le support de détection automatique de conflits n'est pas clairement implémenté comme un workflow complet.
- Il manque une vraie synchronisation backend ou un partage multi-utilisateur.

### 4. IA dépendante de l’environnement
- L’assistant IA fonctionne seulement si un provider externe est configuré et si l’API répond.
- Les erreurs provider sont gérées, mais le service reste dépendant d’un écosystème externe.

### 5. Notifications système
- La permission système est demandée, mais l’expérience dépend du navigateur et de l’autorisation utilisateur.
- L’affichage système peut rester inaccessible si l’utilisateur refuse ou si l’API Notification n’est pas disponible.

## 🚀 Ce qu’il reste à faire pour un déploiement solide

### A. Robustesse et fiabilité
- Ajouter des validations plus fortes pour les mappings de variables et le chaining.
- Gérer proprement les réponses non-JSON, les chemins invalides et les erreurs de parsing.
- Assurer des tests et une UX stables pour les cas d’échec de requête.

### B. Expérience Collections / workflow
- Charger automatiquement une requête sélectionnée depuis les collections dans le builder principal.
- Ajouter un mode « jouer une collection entière » ou « exécuter des scénarios de batch ».
- Lier les collections aux environnements et aux projets de manière plus fluide.

### C. Import/export et synchronisation
- Compléter le workflow d’import/export avec détection/merge de conflits.
- Ajouter un backend de sync ou un partage via fichiers JSON versionnés.
- Prévoir un format d’échange stable pour les collections et environnements.

### D. IA & assistant
- Ajouter un prompt manager plus solide et un historique IA réutilisable.
- Rendre la génération de tests plus fiable avec une validation du JSON renvoyé.
- Intégrer l’IA dans l’analyse de performances ou dans des recommandations de debugging.

### E. Déploiement réel
- Ajouter une authentification/utilisateurs si l’app est multi-utilisateur.
- Mettre en place un backend de production (API sync, stockage cloud, gestion de projets).
- Préparer la build et le déploiement Next.js (Vercel, Netlify, Docker, etc.).
- Ajouter des tests unitaires et E2E pour les flux critiques.

## 📌 Recommandation immédiate
- Stabiliser le `RequestTabsManager` et l’intégration Collections → éditeur.
- Renforcer le chaining de variables pour qu’il soit fiable en production.
- Compléter l’import/export avec un vrai scénario de merge/conflict.
- Tester le backend IA et la proxy OpenAI pour s’assurer qu’il tient en production.

---

Ce fichier donne un état précis du projet : ce qui marche aujourd’hui, ce qui est partiel, et ce qui doit être fait pour pouvoir déployer une version réellement utilisable.
