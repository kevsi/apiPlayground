# Application Functionality Report

## 1. Structure et navigation

L’application utilise une navigation principale via `components/api-sidebar.tsx` et un layout global dans `app/layout.tsx`.
- `SidebarProvider` gère l’état d’ouverture / fermeture de la barre latérale.
- `ApiSidebar` propose les pages suivantes :
  - Dashboard
  - API Endpoints
  - Collections
  - Projects
  - AI Assistant
  - Documentation
  - Settings
- `Toaster` est rendu globalement dans `app/layout.tsx` pour les notifications toast animées.
- Les pages partagent généralement `ApiHeader` et une mise en page `flex` avec `ml-64` ou `ml-[60px]` selon l’état de la sidebar.

## 2. Pages et flux principaux

### 2.1 API Endpoints (`app/page.tsx`)
Flux principal d’utilisation de l’application.
- Rendu de la page principale de test API.
- Utilise `RequestTabsManager` pour afficher et gérer les requêtes API.
- Permet la création, la modification, l’exécution et probablement la sauvegarde des requêtes.

### 2.2 Dashboard (`app/dashboard/page.tsx`)
Vue d’aperçu et métriques.
- Affiche des blocs de statistiques : total requests, temps de réponse moyen, taux de succès, endpoints actifs.
- Montre une liste de requêtes récentes et les endpoints les plus sollicités.
- Inclut un `ThemeSwitcher` pour changer le thème.
- C’est un tableau de bord analytique synthétique, utile comme écran d’accueil secondaire.

### 2.3 Collections (`app/collections/page.tsx`)
Gestion des collections de requêtes.
- Utilise `CollectionsPanel` pour rendre les collections.
- Actions prises en charge via `useRequestStore()` :
  - `addCollection`
  - `updateCollection`
  - `deleteCollection`
  - `addRequestToCollection`
  - `removeRequestFromCollection`
- Permet de sélectionner une requête pour naviguer vers la page d’API ou l’éditer.

### 2.4 Projects / Mes Projets (`app/my-projects/page.tsx`)
Gestion de projets et des routes détectées.
- Interface de création de projet via `NewProjectModal`.
- Sélection et suppression de projet.
- `ProjectCard` affiche chaque projet et permet de le sélectionner.
- `RouteModal` s’ouvre pour le projet sélectionné.
- Flux de projet : ajouter, sélectionner, supprimer, et potentiellement réanalyser.

### 2.5 AI Assistant (`app/ai-insights/page.tsx`)
Assistant IA avancé basé sur les projets et l’historique.
- Sélection de projet actif et provider IA.
- Gestion de la configuration du provider IA et clé API.
- Envoi de requêtes de chat IA vers `/api/proxy-ai`.
- Génération de requêtes suggérées à partir du contexte projet + historique.
- Panneau de notifications locales avec lecture et suppression.
- Intégration de toasts pour les actions importantes : configuration, envoi, erreurs, copie.
- Composants clés : `EnvironmentSelector`, menus déroulants, champ de saisie, suggestions, conversation IA.

### 2.6 Settings (`app/settings/page.tsx`)
Configuration globale de l’application.
- Choix du provider IA.
- Champ de clé API stocké localement.
- Ouverture de permission notifications système.
- Affiche l’état actuel de la permission (`granted`, `denied`, `default`, `unsupported`).
- Boutons : sauvegarder configuration, autoriser notifications, recharger.

### 2.7 Documentation (`app/documentation/page.tsx`)
Page de documentation.
- Contenu placeholder via `EmptyPlaceholder`.
- Indique génération / affichage / export de documentation API.
- Page présente mais pas encore développée en profondeur.

### 2.8 Pages redirigées
- `app/api-keys/page.tsx` redirige vers `/settings`.
- `app/analytics/page.tsx` redirige vers `/settings`.
- Ces pages existent mais n’offrent plus de flux propre.

## 3. Composants et comportements partagés

### 3.1 Barre latérale et header
- `ApiSidebar` contient la navigation et un lien d’accès rapide vers l’assistant IA.
- La sidebar supporte l’état réduit/étendu.
- `ApiHeader` est utilisé comme en-tête commun sur plusieurs pages.

### 3.2 Notifications et toasts
- `Toaster` dans `components/ui/toaster.tsx` rend les notifications toast animées.
- `hooks/use-toast.ts` gère une file de toasts et l’ouverture/fermeture.
- `use-request-store.ts` déclenche un toast à chaque nouvelle notification interne.
- `sonner` est également utilisé sur la page IA pour des retours instantanés.

### 3.3 Stockage local et état global
- `hooks/use-request-store.ts` est le store principal.
- Stocke en local :
  - historique des requêtes
  - collections
  - environnements
  - notifications
  - permission de notification système
  - projets et projet sélectionné
- La persistance est assurée via `localStorage` (`REQLY-REQUEST-STORE`).
- Le store expose des actions pour gérer les données utilisateur.

### 3.4 Configuration IA persistante
- `hooks/use-projects-store.ts` gère la configuration IA :
  - `loadAIProvider`
  - `saveAIProvider`
  - `loadApiKey`
  - `saveApiKey`
- Cette configuration est utilisée dans `Settings` et `AI Assistant`.

## 4. Flux utilisateur existants

### 4.1 Flux de test d’API
1. Ouvre la page principale (`/`).
2. Ajoute ou charge une requête.
3. Envoie la requête via `RequestTabsManager`.
4. Consulte l’historique et les réponses.

### 4.2 Flux collections
1. Ouvre `/collections`.
2. Crée ou modifie une collection.
3. Ajoute des requêtes dans une collection.
4. Sélectionne une requête pour aller tester l’API.

### 4.3 Flux projet
1. Ouvre `/my-projects`.
2. Crée un projet avec `NewProjectModal`.
3. Sélectionne le projet.
4. Ouvre le `RouteModal` pour voir les routes détectées.
5. Active ce projet dans l’assistant IA.

### 4.4 Flux IA
1. Ouvre `/ai-insights`.
2. Choisis un projet actif et un provider IA.
3. Configure/clés API si nécessaire.
4. Envoie une question ou une requête au chatbot IA.
5. Reçois une réponse, notifications et suggestions de requêtes.
6. Copie le snippet `curl` / fetch ou enregistre le contenu.

### 4.5 Flux des paramètres
1. Ouvre `/settings`.
2. Choisis le provider IA.
3. Saisis la clé API.
4. Enregistre.
5. Autorise les notifications système.

## 5. Recommandations d’amélioration

### Priorité haute
- Finaliser la page `Documentation` si tu veux un vrai flux API docs.
- Simplifier ou supprimer la gestion de `Projects` si le produit doit rester centré sur le test API.
- Vérifier la cohérence des liens dans la sidebar si certains menus ne doivent plus exister.

### Priorité moyenne
- Ajouter des fonctionnalités de partage/extraction de requêtes depuis l’assistant IA.
- Améliorer l’historique et l’analyse du dashboard avec des données réelles.
- Ajouter un vrai panneau de notifications persistent (pas seulement dropdown).

### Priorité basse
- Ajouter un guide ou tutoriel sur `Documentation` pour expliquer le workflow.
- Intégrer un export JSON/Swagger pour les collections.

## 6. Conclusions

L’application est globalement construite autour de ces trois axes :
- test et exécution de requêtes API
- organisation des requêtes par collections
- assistance IA contextualisée par projet et historique

Il reste encore des pages secondaires (`Projects`, `Documentation`, `Dashboard`) qui peuvent être optimisées ou simplifiées selon l’orientation souhaitée de l’outil.
