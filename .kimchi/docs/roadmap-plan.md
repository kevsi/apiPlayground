# Plan : Bug Fixes + Features Prioritaires

## Objectif
Corriger les bugs partiels et implémenter les 5 features prioritaires identifiées dans l'analyse.

---

## 🐛 Phase 1 : Bug Fixes Rapides

### 1.1 Timeline de requête (debug mode proxy)
**Problème** : `dns.lookup` existe dans `app/api/proxy/route.ts` mais aucune métrique temps n'est mesurée ni retournée.
**Solution** : Ajouter des timers dans le proxy (DNS lookup, TCP connect, TLS handshake, TTFB, total) et les retourner dans la réponse quand `debug: true`. Le header `x-proxy-debug` existe déjà.
**Fichiers** : `reqy-web/app/api/proxy/route.ts`
**Complexité** : Faible

### 1.2 Virtualisation listes longues
**Problème** : Pas de virtualisation pour collections/history → DOM lourd avec 1000+ items.
**Solution** : Installer `@tanstack/react-virtual` (ou `react-window`). Wrapper les listes collections et history avec `useVirtualizer`.
**Fichiers** : `reqy-web/components/collections-panel.tsx`, liste history dans Command Palette
**Complexité** : Moyenne

### 1.3 Tests automatisés — runner + UI
**Problème** : Seule l'IA génère des assertions. Pas de runner ni d'UI pour définir/persister/exécuter des tests.
**Solution** : 
- Ajouter un type `TestAssertion` persistant par requête (dans le store)
- UI minimale dans `request-panel.tsx` (onglet "Tests") pour ajouter des assertions simples (status, body contains, header exists)
- Runner : exécuter automatiquement les assertions après chaque requête
**Fichiers** : `reqy-web/lib/types.ts`, `reqy-web/hooks/use-request-store.ts`, `reqy-web/components/request-panel.tsx`
**Complexité** : Moyenne

---

## ✨ Phase 2 : Import cURL
**Feature** : #9 — Parser une commande cURL et la convertir en requête Reqly.
**Solution** : Utiliser la lib npm `curlconverter` (ou parser custom robuste). Ajouter un onglet/bouton "Import cURL" dans l'import modal existant.
**Fichiers** : `reqy-web/components/import-export-modal.tsx` ou nouveau `import-curl-modal.tsx`
**Complexité** : Faible (lib existante)

---

## ✨ Phase 3 : WebSocket Support
**Feature** : #16 — Envoyer/recevoir des messages WebSocket.
**Solution** :
- Hook `useWebSocket` (connexion, messages, état close/error)
- UI : onglet "WebSocket" dans le request-panel (URL ws://, bouton connect, log messages send/receive)
- Affichage différencié des messages (entrants/sortants)
**Fichiers** : `reqy-web/hooks/use-websocket.ts`, `reqy-web/components/websocket-panel.tsx`, `reqy-web/components/request-panel.tsx`
**Complexité** : Moyenne

---

## ✨ Phase 4 : Diff Réponses
**Feature** : #27 — Comparer deux réponses côte à côte.
**Solution** :
- Lib `diff-match-patch` ou `fast-diff` pour le diff texte
- Composant `DiffViewer` (split view ou inline) avec coloration
- UI : sélectionner 2 historiques et afficher le diff
**Fichiers** : `reqy-web/components/diff-viewer.tsx`, `reqy-web/components/api-header.tsx` (Command Palette)
**Complexité** : Moyenne

---

## ✨ Phase 5 : CLI CI/CD
**Feature** : #15 — Lancer des collections depuis le terminal.
**Solution** :
- Nouveau package dans le monorepo : `packages/cli/` ou binaire Tauri
- Utiliser `clap` (Rust) ou `commander` (Node.js) pour le CLI
- Parser les collections JSON exportées
- Exécuter chaque requête et afficher les résultats (table/pretty)
- Code de retour 0/1 pour CI
**Fichiers** : `packages/cli/src/index.ts` (si Node) ou `src-tauri/src/cli.rs` (si Rust)
**Complexité** : Élevée

---

## ✨ Phase 6 : Timeline Visuelle
**Feature** : #28 — Afficher les métriques DNS/TCP/TTFB.
**Solution** :
- Extension de la Phase 1.1 : le proxy retourne déjà les métriques
- UI : composant `TimelineBar` avec barres colorées par phase (DNS, TCP, TLS, TTFB, Download, Total)
- Intégrer dans le response panel
**Fichiers** : `reqy-web/components/response-timeline.tsx`, `reqy-web/components/response-panel.tsx`
**Complexité** : Faible (dépend de 1.1)

---

## 📊 Critères de succès par phase

| Phase | Succès |
|-------|--------|
| 1.1 | Le proxy retourne `x-timeline-*` headers avec les ms |
| 1.2 | Les listes > 100 items restent fluides (60fps) |
| 1.3 | Onglet "Tests" visible + assertions exécutées auto |
| 2 | Bouton "Importer depuis cURL" parse 90%+ des cas standards |
| 3 | Connexion WS fonctionnelle, messages visibles |
| 4 | Diff 2 réponses possible via Command Palette |
| 5 | `npx reqly-cli run collection.json` fonctionne en terminal |
| 6 | Timeline visible avec barres colorées |

---

## 🎯 Préconisation d'ordre

**Parallélisable dès le début** :
- Phase 1.1 + 1.2 + 2 (indépendants)

**Dépendances** :
- Phase 6 dépend de 1.1 (proxy metrics)

**Plus gros ROI / moindre effort** :
1. Phase 1.1 (Timeline proxy) — ~2h
2. Phase 2 (Import cURL) — ~3h (lib existante)
3. Phase 1.3 (Tests runner) — ~4h
4. Phase 3 (WebSocket) — ~5h
5. Phase 4 (Diff) — ~4h
6. Phase 6 (UI Timeline) — ~2h (dépend de 1.1)
7. Phase 5 (CLI) — ~8h
