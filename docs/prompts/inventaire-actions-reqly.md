# Inventaire des actions Reqly

> Inventaire brut construit à partir du codebase. Chaque entrée liste le déclencheur utilisateur, l’action/stock/fonction correspondante, les paramètres et les erreurs connues.

## Légende
- **Déclencheur** : formulation utilisateur attendue
- **Action / Store / Hook** : nom réel dans le code
- **Fichier source** : chemin + ligne
- **Paramètres** : contraints ou libres
- **Erreurs / limites** : cas d’échec identifiés
- **Garde-fous** : confirmations UI, rate limits, contraintes

---

## 1. Workspaces

| Déclencheur | Action / Store / Hook | Fichier source | Paramètres | Erreurs / limites | Garde-fous |
|---|---|---|---|---|---|
| Créer un workspace | `addServerWorkspace` | `reqy-web/app/api/workspaces/route.ts` | `name` non vide | 400 si vide | — |
| Renommer | `updateWorkspace` / PUT `/api/workspaces/{id}` | `reqy-web/app/api/workspaces/[id]/route.ts` | `name` | 404 si absent | — |
| Supprimer | `deleteWorkspace` / DELETE `/api/workspaces/{id}` | idem | `id` | 404 | Confirmation UI native |
| Changer de workspace actif | `setActiveWorkspace` | store workspaces | `id` | — | Instantané |
| Inviter un membre | `POST /api/workspaces/{id}/invitations` | `reqy-web/app/api/workspaces/[id]/invitations/route.ts` | `email` | 400 si invalide | — |

## 2. Collections

| Déclencheur | Action / Store / Hook | Fichier source | Paramètres | Erreurs / limites | Garde-fous |
|---|---|---|---|---|---|
| Créer | `addCollection` | `reqy-web/hooks/store/collections.ts` | `name`, `workspaceId` | — | — |
| Renommer | `updateCollection` | idem | `id`, `name` | 404 | — |
| Supprimer | `deleteCollection` | idem | `id` | 404 | Confirmation UI native |
| Dupliquer | `duplicateCollection` | idem | `id` | — | — |
| Réordonner | `reorderCollections` | idem | nouvel ordre | — | Pas de feedback natif connu |

## 3. Dossiers

| Déclencheur | Action / Store / Hook | Fichier source | Paramètres | Erreurs / limites | Garde-fous |
|---|---|---|---|---|---|
| Créer | `addFolder` | `reqy-web/hooks/store/folders.ts` | `name`, `collectionId`, `parentId?` | — | — |
| Renommer | `renameFolder` | idem | `id`, `name` | 404 | — |
| Supprimer | `deleteFolder` | idem | `id` | 404 | Confirmation UI native |
| Déplacer une requête vers un dossier | `moveRequestToFolder` | idem | `requestId`, `folderId?` | — | — |
| Déplacer un dossier | `moveFolder` | idem | `id`, `targetFolderId?` | Anti-circularité | — |
| Réordonner requêtes/dossiers | `reorderRequestsInCollection`, `reorderFolders` | idem | ordre cible | — | Pas de feedback natif connu |

## 4. Requêtes

| Déclencheur | Action / Store / Hook | Fichier source | Paramètres | Erreurs / limites | Garde-fous |
|---|---|---|---|---|---|
| Créer | `createNewRequestInCollection` / `addRequestToCollection` | `reqy-web/components/request-panel.tsx` | `name`, `method`, `url`, `collectionId?` | url vide souvent invalide | Poser 1 question si absence de collection |
| Modifier | `updateRequestInCollection` / `updateRequestById` | idem | `id`, champs modifiés | — | — |
| Supprimer | `removeRequestFromCollection` | idem | `id` | 404 | Confirmation UI native |
| Exécuter | `executeRequest` | `reqy-web/components/request-executor.tsx` | requête active | Timeout/réseau/SSRF | 400/500 ≠ échec action |
| Sauvegarder | `addRequestToCollection` + `updateTab(isSaved: true)` | idem | — | collection absente → draft only | — |
| Dupliquer | duplication d’onglet / `duplicateTab` | `reqy-web/hooks/use-request-tabs-state.ts` | — | — | Nom auto “X Copy” |
| Formater JSON body | `handleFormatJson` | `reqy-web/components/request-panel.tsx` | body courant | Échec silencieux si JSON invalide | Signaler explicitement |
| Exécuter et sauvegarder | `sendAndSave` | `reqy-web/components/request-executor.tsx` | — | voir Exécuter | — |
| Exécuter et télécharger | `sendAndDownload` | idem | — | voir Exécuter | — |
| Analyser (AI) | `runProactiveAnalysis` | `reqy-web/components/ai-sidebar.tsx` | requête cible | — | — |
| Générer tests (AI) | `handleGenerateTests` | idem | requête cible | — | — |
| Exporter snippet curl/fetch | `exportActiveRequest` | `reqy-web/components/request-panel.tsx` | requête active | — | — |

## 5. Onglets

| Déclencheur | Action / Store / Hook | Fichier source | Paramètres | Erreurs / limites | Garde-fous |
|---|---|---|---|---|---|
| Nouvel onglet | `addNewTab` | `reqy-web/hooks/use-request-tabs-state.ts` | — | — | — |
| Fermer un onglet | `closeTab` | idem | `id` | Non sauvegardé → dialog natif | Expliquer la confirmation |
| Forcer fermeture | `forceCloseTab` | idem | `id` | Après confirmation UI | — |
| Dupliquer | `duplicateTab` | idem | `id` | — | Nom auto “X Copy” |
| Fermer autres / droite / tous | `closeOthers`, `closeToRight`, `closeAllTabs` | idem | `id` | idem | Idem |
| Sauvegarder onglet actif | `saveActiveTab` | idem | — | → dialog sauvegarde | — |
| Sauvegarder tous les onglets | `saveAllTabs` | idem | — | — | Feedback “N onglets sauvegardés” |

## 6. Environnements

| Déclencheur | Action / Store / Hook | Fichier source | Paramètres | Erreurs / limites | Garde-fous |
|---|---|---|---|---|---|
| Créer | `addEnvironment` | `reqy-web/hooks/store/environments.ts` | `name` | — | — |
| Renommer | `updateEnvironment(id, { name })` | idem | `id`, `name` | 404 | — |
| Supprimer | `deleteEnvironment` | idem | `id` | 404 | Confirmation UI native |
| Activer un environnement | `setActiveEnvironment(id)` | idem | `id` | — | Action centrale |
| Ajouter une variable | `updateEnvironment(id, { variables: [...] })` | idem | `key`, `value`, `enabled` | créée vide par défaut | — |
| Modifier une variable | `updateVar(index, field, value)` → `updateEnvironment` | idem | `index`, champ | — | Masquer valeurs sensibles |
| Supprimer une variable | `removeVar(index)` | idem | `index` | — | Confirmation demandée |

## 7. Variables Mappings (Request Chaining)

| Déclencheur | Action / Store / Hook | Fichier source | Paramètres | Erreurs / limites | Garde-fous |
|---|---|---|---|---|---|
| Ajouter un mapping | `addVariableMapping` | `reqy-web/components/request-chaining-dialog.tsx` | source, path | — | — |
| Modifier | `onUpdateMapping` | idem | `id`, champs | Validation visuelle, pas de blocage | Avertir si format invalide |
| Supprimer | `onRemoveMapping` | idem | `id` | — | Confirmation demandée |

## 8. Historique

| Déclencheur | Action / Store / Hook | Fichier source | Paramètres | Erreurs / limites | Garde-fous |
|---|---|---|---|---|---|
| Charger / rejouer | `onSelectRequest` | `reqy-web/components/history-panel.tsx` + `hooks/store/history.ts` | entrée | — | Même handler UI, ne pas séparer les mots |
| Générer requête de suivi | `onGenerateFollowUp` | idem | entrée source | — | — |
| Retirer un élément | `onRemoveItem` | idem | item | — | Confirmation demandée |
| Vider tout | `onClearHistory` | idem | — | — | Confirmation UI native |

## 9-10. Import / Export — Postman

| Déclencheur | Action / Store / Hook | Fichier source | Paramètres | Erreurs / limites | Garde-fous |
|---|---|---|---|---|---|
| Importer cURL | `handleCurlImport` | `reqy-web/components/postman/import-modal.tsx` | texte cURL | Besoin ≥ 1 collection | Échec parsing clair |
| Exporter le bundle | `handleExport` | `reqy-web/components/postman/manage-modal.tsx` | choix collections/envs | — | Feedback N collections/envs |
| Lister collections Postman | `getPostmanCollections` | `reqy-web/app/api/postman-auth/collections/route.ts` | — | Requiert `postmanConnected` | Sinon rediriger vers Settings |
| Importer une collection Postman | `POST /api/postman-import/save` | idem | `collectionId`, confirmation | Preview puis confirmation | 30 req/min |
| Exporter vers Postman | `handleExportCollectionsToPostman` | `reqy-web/components/postman/manage-modal.tsx` | selections | `postmanConnected` requis | — |

## 11. GitHub

| Déclencheur | Action / Store / Hook | Fichier source | Paramètres | Erreurs / limites | Garde-fous |
|---|---|---|---|---|---|
| Connecter | `connectGithub` | `reqy-web/components/settings/integrations-section.tsx` | — | OAuth redirect | Orienté vers Settings UI |
| Déconnecter | `disconnectGithub` / POST `/api/github-auth/logout` | `reqy-web/app/api/github-auth/logout/route.ts` | — | — | — |
| Importer un dépôt | `handleImport` / POST `/api/github-import` | `reqy-web/components/import-github-modal.tsx` | `owner`, `repo` | 404 si dépôt inconnu | 20 req/min |

## 12. OpenAPI

| Déclencheur | Action / Store / Hook | Fichier source | Paramètres | Erreurs / limites | Garde-fous |
|---|---|---|---|---|---|
| Importer une spec | `handleImportOpenApi` | `reqy-web/components/import-openapi-modal.tsx` | `file`/URL | Collisions résolues auto | — |
| Exporter en OpenAPI | `handleExportOpenApi` | `reqy-web/components/openapi-export-modal.tsx` | collection active | Désactivé si vide | — |

## 13. GraphQL

| Déclencheur | Action / Store / Hook | Fichier source | Paramètres | Erreurs / limites | Garde-fous |
|---|---|---|---|---|---|
| Changer l’endpoint | `onEndpointChange` | `reqy-web/components/graphql-tabs-manager.tsx` | URL | Pas de validation format | Vérifier ressemblance URL |
| Envoyer une requête | `runQuery` | `reqy-web/components/graphql-tabs-manager.tsx` | `endpoint`, `query` | Requiert endpoint + query | — |
| Introspection | `introspect` | idem | endpoint | Endpoint requis | — |
| AI Assist / AI Fix | `handleAiAssist` / `handleAiFix` | `reqy-web/components/ai-sidebar.tsx` | query | Fix nécessite erreur visible | — |
| Snapshot / diff | `saveSnapshot` / `computeDiff` | `reqy-web/components/graphql-schema-diff.tsx` | schéma chargé | Besoins schéma | — |

## 14. WebSocket

| Déclencheur | Action / Store / Hook | Fichier source | Paramètres | Erreurs / limites | Garde-fous |
|---|---|---|---|---|---|
| Créer une connexion | `createConnection` + `connect(url, headers)` | `reqy-web/hooks/use-websocket-store.ts` | `url`, `headers?` | `ws://` ou `wss://` requis | Headers custom en Tauri desktop uniquement |
| Changer la connexion active | `setActiveConnection(id)` | idem | `id` | — | Instantané |
| Envoyer un message | `handleSend` → `appendMessage` | idem | message | Requiert connexion active | — |
| Se déconnecter | `ws_disconnect` / `ws.close()` → `setDisconnectedAt` | idem | `id` | — | — |
| Déconnecter toutes | boucle `removeConnection` / `ws_disconnect` | idem | toutes les connexions actives | — | Traiter comme action groupée |
| Supprimer une connexion | `removeConnection(id)` | idem | `id` | Historique non trivial ? | Confirmation demandée |
| Modifier les headers | `setHeaders(id, headers)` | idem | `id`, headers | Désactivé si connecté ou navigateur | — |
| Modifier l’authentification | `setAuthConfig(id, config)` | idem | `id`, config | Désactivé si connecté ; Bearer en Tauri desktop | — |
| Vider les messages | `clearMessages` | idem | `id` | Requiert ≥ 1 message | — |

## 15. SSE

| Déclencheur | Action / Store / Hook | Fichier source | Paramètres | Erreurs / limites | Garde-fous |
|---|---|---|---|---|---|
| Se connecter | `connect(url)` | `reqy-web/hooks/use-sse.ts` | `url` (trim) | Pas de validation format | Pas de headers custom, pas d’auth dédiée |
| Se déconnecter | `disconnect()` | idem | — | — | Ferme l’EventSource |
| Vider les événements | `clearEvents()` | idem | — | — | — |
| Reconnexion | Gérée par `EventSource`, ajout de `lastEventId` | idem | — | Non configurable | Aucun paramètre `retry` exposé |

**Limitations réelles** : `EventSource` natif ; seulement événement par défaut ; cap 500 événements.

## 16. MCP Tools

| Déclencheur | Action / Store / Hook | Fichier source | Paramètres | Erreurs / limites | Garde-fous |
|---|---|---|---|---|---|
| Démarrer le serveur MCP | `start_mcp_server` | `reqy-web/hooks/use-mcp-server.ts` | commande + args | Requiert Node.js | — |
| Arrêter | `stop_mcp_server` | idem | — | — | — |
| Synchroniser les collections | `sync_mcp_collections` | idem | — | Anti-réentrance + dédoublonnage | — |
| Vérifier le statut | `get_mcp_server_status` | idem | — | Auto-cleanup si process tué | — |
| Lire le bundle | `read_mcp_bundle` | idem | — | Retour chaîne vide si absent | — |
| Copier l’URL du serveur | `handleCopyUrl` | idem | — | — | — |
| Changer le port | état local + redémarrage | idem | port | 1024–65535 ; serveur arrêté requis | — |

## 17. Proxy de capture

| Déclencheur | Action / Store / Hook | Fichier source | Paramètres | Erreurs / limites | Garde-fous |
|---|---|---|---|---|---|
| Démarrer | `start_capture_proxy(port)` | `src-tauri/src/capture.rs` | `port` | ≥ 1024 | — |
| Arrêter | `stop_capture_proxy` | idem | — | — | — |

## 18. Assistant IA / Settings

| Déclencheur | Action / Store / Hook | Fichier source | Paramètres | Erreurs / limites | Garde-fous |
|---|---|---|---|---|---|
| Configurer un provider IA | `handleModalSave` | `reqy-web/components/settings/ai-provider-modal.tsx` | provider + clé + modèle | Pas validation format | Jamais afficher clé en clair |
| Tester la connexion | `handleTestConnection` | idem | provider, clé, modèle | Requiert clé + modèle (sauf Ollama) | — |
| Auto-apply IA | activation auto via settings | idem | — | Confirmation explicite requise | Ne pas contourner |

## 19. Projets (My Projects)

| Déclencheur | Action / Store / Hook | Fichier source | Paramètres | Erreurs / limites | Garde-fous |
|---|---|---|---|---|---|
| Créer un projet | `addProject` | `reqy-web/app/my-projects/page.tsx` + `hooks/store/projects.ts` | `name`, métadonnées | — | — |
| Modifier | `updateProject` | idem | `id`, champs | 404 | — |
| Supprimer | `deleteProject` | idem | `id` | 404 | Confirmation UI native |
| Sélectionner un projet actif | `setSelectedProject` | idem | `id` | — | Instantané |
| Analyser un projet (AI) | `analyzeProject` | idem | projet cible | — | — |

## 20. Runner (Collection Runner)

| Déclencheur | Action / Store / Hook | Fichier source | Paramètres | Erreurs / limites | Garde-fous |
|---|---|---|---|---|---|
| Exécuter une collection | `runCollection` → `POST /api/test-runner/run` | `reqy-web/app/runner/page.tsx` | `{ collection }` | 10 req/min | `environment`/`dataset` acceptés par route mais pas exposés par UI Runner |
| Annuler un run | `cancelRun` | idem | run courant | — | — |
| Exporter le rapport | `?format=junit` | `reqy-web/app/api/test-runner/run/route.ts` | — | — | — |

## 21. SDK Generator

| Déclencheur | Action / Store / Hook | Fichier source | Paramètres | Erreurs / limites | Garde-fous |
|---|---|---|---|---|---|
| Générer un SDK | `generateSdk` | `reqy-web/app/sdks/page.tsx` + `reqy-web/lib/openapi-gen/generator.ts` | `collection`, `language` | 11 langages via `GENERATORS` | Refuser langage hors liste |

## 22-24. Notifications / Thème

| Déclencheur | Action / Store / Hook | Fichier source | Paramètres | Erreurs / limites | Garde-fous |
|---|---|---|---|---|---|
| Activer/désactiver notifications | toggle notifications | `reqy-web/components/api-header.tsx` | — | — | — |
| Changer de thème | `setTheme` / theme switcher | `reqy-web/components/theme-switcher.tsx` | `dark`/`light`/`system` | — | — |

## Trous et gaps connus
- Runner UI n’expose pas `environment`/`dataset` même si la route API les accepte.
- SSE n’expose pas `retry`, ni headers, ni auth dédiée.
- GraphQL n’a pas de validation d’URL côté code.
- Certaines réordonnances manquent de feedback natif.
