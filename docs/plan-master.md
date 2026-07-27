# Master Plan — Réduction dette technique + Fonctionnalités manquantes

> **Pour les workers agentic :** Chaque phase est indépendante et peut être exécutée
> séquentiellement. Les phases 0-1 stabilisent le repo. Les phases 2-4 ajoutent des
> fonctionnalités. Les phases 5-6 sont du polish.

---

## Résumé des travaux

| Phase | Description                                                | Effort | Dépendances |
| ----- | ---------------------------------------------------------- | ------ | ----------- |
| **0** | Stabilité du repo (commit WIP, CRLF, stash)                | Moyen  | Aucune      |
| **1** | Unification shared (JSONPath, assertions) + splits         | Grand  | Phase 0     |
| **2** | UX : confirmations destructives + reset safeguards         | Petit  | Phase 0     |
| **3** | Auth réelle (Supabase ou autre)                            | Grand  | Phase 0     |
| **4** | Tests Rust + sync-server + Vitest v3                       | Moyen  | Phase 0-1   |
| **5** | Build vérification (Tauri, SDK)                            | Petit  | Phase 1     |
| **6** | Polish : streaming AI, export centralisé, CRLF renormalize | Moyen  | Phase 0     |

---

## Phase 0 — Stabilité du repo 🔴 **PRÉREQUIS ABSOLU**

### 0.0 Vérifier `.gitattributes` + renormaliser

**Problème :** CRLF warnings à chaque commande git.

**Statut :** `.gitattributes` existe déjà ✅ (mais il faut renormaliser).

**Action :**

```bash
git add --renormalize .
```

**Fichiers :** `.gitattributes` (existe déjà)
**AC :** `git status` ne montre plus aucun warning CRLF.

---

### 0.1 Commiter les 67 fichiers en suspens

**Problème :** 67+ fichiers non commités bloquent toute avancée.

**Analyse des groupes (détaillé dans `tasks/plan-correction.md`) :**

| Groupe | Contenu                                       | Commits proposés                                                |
| ------ | --------------------------------------------- | --------------------------------------------------------------- |
| A      | `packages/shared` + `recli/src/assertions.ts` | `feat(shared): add assertions, openapi, variable-path modules`  |
| B      | `reqy-web/lib/ai-engine/` (split)             | `feat(web): split ai-engine.ts into lib/ai-engine/ directory`   |
| C      | sync-server tests (8 fichiers)                | `test(sync-server): add test files + rate-limiter + validation` |
| D      | Tauri websocket auth + tests                  | `feat(tauri): add websocket auth, commands, tests`              |
| E      | UI components, hooks, pages                   | `feat(web): update UI components, hooks, and pages`             |

**Action :**

1. Inspecter chaque groupe (`git diff --stat`, `git status`)
2. Stager groupe par groupe
3. Commiter chaque groupe séparément (5 commits logiques)
4. Supprimer les `.deb` accidentels

**Détail complet :** `tasks/plan-correction.md` lignes 65-122

**AC :** `git status --porcelain` ne montre que des untracked (pas de modified).

---

### 0.2 Nettoyer le stash

**Action :** Inspecter `stash@{0}`. Si c'est un backup lint-staged, le dropper.

---

### 0.3 Supprimer les binaires `.deb` accidentels

**Action :** `git rm libglib2.0-dev_*.deb pkg-config_*.deb`

---

**Documents source :** `tasks/plan-correction.md` Phase 0

---

## Phase 1 — Unification & Refactoring 🟡

### 1.1 Câbler `recli/src/commands/` + `utils.ts`

**Problème :** `recli/src/index.ts` fait 578 lignes. Les fichiers split existent déjà
(dans le WIP) mais ne sont pas câblés.

**Action :** Réécrire `index.ts` pour importer depuis `commands/*` et `utils.ts`.

**Détail :** `tasks/plan-correction.md` Phase 1.0 (lignes 144-183)

**AC :**

- [ ] `index.ts` < 100 lignes
- [ ] `pnpm --dir recli build` réussit
- [ ] `pnpm --dir recli test` passe

---

### 1.2 Unifier JSONPath dans `@reqly/shared`

**Problème :** 3 implémentations concurrentes de résolution de chemin JSON :

- `recli/src/path-utils.ts`
- `reqy-mcp/src/variable-path.ts`
- `reqy-web/lib/variable-path.ts`

**Action :** Créer `packages/shared/src/variable-path/` et faire pointer les 3 consommateurs.

**Fichiers :**

- `packages/shared/src/variable-path/index.ts`
- `packages/shared/src/variable-path/__tests__/variable-path.test.ts`
- Modifier `recli/src/path-utils.ts`, `reqy-mcp/src/variable-path.ts`, `reqy-web/lib/variable-path.ts`

**Détail :** `tasks/remaining-phases.md` Phase 1.5

**AC :**

- [ ] `resolveJsonPath()` fonctionne (signature recli)
- [ ] `getValueByPath()` retourne `PathExtractionResult` (signature reqy-mcp/web)
- [ ] Tous les tests existants passent

---

### 1.3 Unifier le moteur d'assertions dans `@reqly/shared`

**Problème :** 2 moteurs d'assertion différents :

- `recli/src/assertions.ts` (format texte : `status == 200`)
- `reqy-mcp/src/assertions.ts` (format structuré)

**Action :** Créer `packages/shared/src/assertions/` avec support des deux formats.

**Dépend :** 1.2 (JSONPath unifié)

**Détail :** `tasks/remaining-phases.md` Phase 1.4

**AC :**

- [ ] `evaluateAssertion()` supporte format texte
- [ ] `evaluateAssertions()` supporte format structuré
- [ ] Validation JSON Schema fonctionne
- [ ] Tous les tests existants passent

---

### 1.4 Split `ai-engine.ts` (767 → 6 fichiers)

**Problème :** Un seul fichier avec 5 responsabilités (types, prompts, parsing, API, dispatch).

**Statut :** Les fichiers split existent déjà dans le WIP (Groupe B).

**Action :**

1. Vérifier que les 6 fichiers sont complets
2. Mettre à jour tous les imports
3. Supprimer l'ancien `ai-engine.ts`
4. Vérifier build + tests

**Fichiers :**

- `reqy-web/lib/ai-engine/index.ts` (barrel)
- `reqy-web/lib/ai-engine/types.ts`
- `reqy-web/lib/ai-engine/prompts.ts`
- `reqy-web/lib/ai-engine/parser.ts`
- `reqy-web/lib/ai-engine/providers.ts`
- `reqy-web/lib/ai-engine/dispatch.ts`

**Détail :** `tasks/remaining-phases.md` Phase 2.1

**AC :**

- [ ] Aucun fichier > 200 lignes
- [ ] Mêmes exports publics qu'avant
- [ ] Tous les imports existants fonctionnent
- [ ] `npx tsc --noEmit` réussit

---

### 1.5 Split `src-tauri/src/lib.rs` (514 lignes → modules)

**Problème :** `lib.rs` contient fetch_proxy, capture proxy, et run().

**Action :** Créer `fetch.rs`, `capture.rs`, `open.rs`.

**Détail :** `tasks/remaining-phases.md` Phase 2.3

**AC :**

- [ ] `lib.rs` < 60 lignes
- [ ] `cargo build` réussit

---

## Phase 2 — UX & Robustesse 🟡

### 2.0 Ajouter les confirmations pour actions destructives

**Problème :** 15+ actions destructives sans aucune confirmation utilisateur
(liste complète dans `tasks/INVENTAIRE.md` lignes 232-250).

**Actions concernées :**

| Action                      | Fonction             | Store                 |
| --------------------------- | -------------------- | --------------------- |
| `deleteCollection`          | `removeCollection`   | `use-request-store`   |
| `deleteEnvironment`         | `removeEnvironment`  | `use-request-store`   |
| `deleteRequest`             | `removeRequest`      | `use-request-store`   |
| `deleteAssertion`           | `removeAssertion`    | `use-request-store`   |
| `clearExecutionHistory`     | -                    | `use-request-store`   |
| `clearHistory`              | `clearHistory`       | `use-request-store`   |
| `removeEnvironmentVariable` | `removeVariable`     | `use-request-store`   |
| `removeHeader`              | `removeHeader`       | use-request-tab-state |
| `removeQueryParam`          | `removeQueryParam`   | use-request-tab-state |
| `clearNotifications`        | `clearNotifications` | Notification store    |
| `deleteFolder`              | `removeFolder`       | `use-request-store`   |
| `deleteWorkspace`           | `removeWorkspace`    | Workspace store       |
| `removeMember`              | `removeMember`       | Workspace store       |
| `clearCache`                | -                    | System                |
| `resetData`                 | `reset`              | Zustand stores        |
| `resetSettings`             | `reset`              | Settings store        |

**Approche :**

1. Créer un composant `ConfirmDialog` réutilisable (ou utiliser AlertDialog existant)
2. Pour chaque action, wrapper l'appel avec une confirmation
3. Cas particulier : `reset()` doit demander confirmation AVANT d'être appelé

**Fichiers type par action :**

```tsx
// Avant
<Button onClick={() => deleteCollection(id)}>Supprimer</Button>

// Après
<ConfirmDialog
  title="Supprimer la collection"
  description="Cette action est irréversible."
  onConfirm={() => deleteCollection(id)}
>
  <Button>Supprimer</Button>
</ConfirmDialog>
```

**AC :**

- [ ] Composant `ConfirmDialog` générique créé (ou utilisation d'AlertDialog)
- [ ] Chaque action destructive a une confirmation
- [ ] Le message décrit précisément ce qui va être supprimé

---

### 2.1 Zustand `reset()` — safeguards

**Problème :** `reset()` dans les stores Zustand n'a aucune confirmation UI ni log
de sauvegarde.

**Action :**

1. Pour chaque store avec `reset()`, remplacer `reset()` par `confirmReset()` qui :
   - Affiche une confirmation
   - Sauvegarde une copie de backup dans localStorage
2. Ajouter un bouton "Restaurer" dans Settings si un backup existe

**Stores concernés :** Vérifier `use-request-store`, settings store, etc.

**AC :**

- [ ] `reset()` ne peut pas être appelé sans confirmation
- [ ] Backup automatique avant reset

---

## Phase 3 — Auth 🔴

### 3.0 Décider la stratégie d'auth

**Problème :** Le système Supabase est là mais désactivé (mode dev mock).
Pas de login, pas de sessions, pas de multi-utilisateurs réels.

**Options :**

- **A : Activer Supabase** — déjà intégré, juste à connecter
- **B : Auth locale** — simple, pas de serveur externe
- **C : Auth via le sync-server** — logique si le sync est utilisé
- **D : Garder le mock** — acceptable pour un projet solo/open-source

**Action préalable :** Analyser le code Supabase existant et décider.

---

## Phase 4 — Tests 🟢

### 4.0 Tests Rust (MCP, fetch, websocket)

**Problème :** Les modules Rust n'ont pas de tests unitaires.

**Détail :** `tasks/remaining-phases.md` Phase 3 + `tasks/plan-correction.md` Phase 2

**Tâches :**

- 4.0a Tests pour `mcp.rs` (3+ tests)
- 4.0b Tests pour `fetch.rs` (5+ tests, decode_html_entities)

**AC :**

- [ ] `cargo test` passe avec ≥ 8 tests
- [ ] `cargo build` sans warnings

---

### 4.1 Tests sync-server

**Problème :** Les fichiers de test sync-server existent déjà dans le WIP (Groupe C).

**Action :**

1. Vérifier que les 8 fichiers de test sont complets
2. Les lancer avec `pnpm --dir sync-server test`
3. Corriger si nécessaire

**Détail :** `tasks/remaining-phases.md` Phase 4 (tâches 4.1-4.5)

**AC :**

- [ ] `pnpm --dir sync-server test` passe
- [ ] Au moins 20 tests au total

---

### 4.2 Vitest v3 pour sync-server

**Problème :** sync-server utilise encore Vitest v2.

**Action :** `vitest: "^3.0.0"` dans `sync-server/package.json` + adapter config.

**Détail :** `tasks/plan-correction.md` Phase 3

**AC :** Tous les tests sync-server passent avec Vitest 3

---

## Phase 5 — Build & Vérification 🟡

### 5.0 Build Tauri desktop

**Action :** Lancer `cargo build` (déjà vert), puis `tauri build` pour vérifier le bundling.

**AC :** `tauri build` produit un `.msi` / `.dmg` / `.AppImage` fonctionnel.

---

### 5.1 Vérifier SDKs générés (non-TS)

**Action :** Pour chaque langage supporté (Go, Python, Rust, Java, etc.) dans
l'export SDK, vérifier que le code généré compile.

**AC :** Au moins TypeScript + 1 autre langage vérifiés.

---

## Phase 6 — Polish 🟢

### 6.0 AI streaming

**Problème :** Les réponses AI sont en full-text, pas en streaming.

**Action :** Implémenter le streaming SSE dans `callAI()` et l'afficher
progressivement dans l'UI.

**AC :** Les réponses AI s'affichent mot par mot.

---

### 6.1 Centraliser `exportActiveRequest` dans le store

**Problème :** `exportActiveRequest` existe dans `use-request-tab-execution.ts`
mais pas dans le store principal.

**Action :** Déplacer dans `use-request-store.ts`.

**AC :** Plus de doublon.

---

### 6.2 CRLF renormalize final

**Problème :** Même avec `.gitattributes`, les fichiers existants peuvent encore avoir du CRLF.

**Action :** Après Phase 0, lancer `git add --renormalize .` sur tous les fichiers suivis.

---

### 6.3 i18n (optionnel)

**Problème :** Mix FR/EN dans l'UI, pas de système de traduction.

**Action :** À évaluer. Peut-être pas prioritaire pour un outil dev.

---

## Dépendances entre phases

```
Phase 0 (repo stable)
  ├── Phase 1 (unification) ──→ Phase 5 (build vérification)
  ├── Phase 2 (UX) ────────→ Phase 6 (polish)
  ├── Phase 3 (auth) ──────────┐
  └── Phase 4 (tests) ─────────┤
                               ↓
                          Phase 5 (build)
```

## Prochaine action immédiate

1. **✅ Approuve ce plan**
2. **Phase 0** : Inspecter + commiter le WIP (groupe par groupe)
3. Ensuite : Phase 1, puis 2, etc.

---

## Références

- `tasks/plan-correction.md` — Plan détaillé Phases 0-4 (commit WIP, recli, tests Rust, Vitest)
- `tasks/remaining-phases.md` — Plan détaillé Phases 1.4-4.5 (unification assertions, JSONPath, splits, tests)
- `tasks/INVENTAIRE.md` — Inventaire complet des actions + actions sans confirmation
- `tasks/plan.md` — Plan sync-store (déjà fait ? à vérifier)
