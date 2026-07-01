# Plan d'amélioration Reqly — Audit réel post-README

## Contexte
L'analyse initiale du README listait 13 problèmes. **Tous sont déjà résolus ou obsolètes.**
Ce plan couvre les problèmes **réels** identifiés lors de l'audit manuel du code.

## Problèmes réels identifiés

### 1. Modèles IA par défaut inexistants/obsolètes
**Fichiers** : `reqy-web/app/api/proxy-ai/route.ts`, `reqy-web/lib/ai-engine.ts`
**Problème** :
- `gemini-2.0-flash` → n'existe pas (Gemini n'a pas de série 2.0 publique)
- `openai/gpt-5.2` (OpenRouter) → n'existe pas
- `claude-sonnet-4-20250514` / `claude-sonnet-4-20250514` → inconsistant, potentiellement obsolète
- `deepseek-chat` → OK
- `llama3` (Ollama) → OK mais llama3.1 ou llama3.2 préférable

**Correction** : Utiliser des modèles valides et reconnus :
- Gemini : `gemini-1.5-flash`
- OpenRouter : `openai/gpt-4o-mini`
- Anthropic : `claude-3-5-sonnet-20241022` (modèle stable actuel)
- DeepSeek : `deepseek-chat` (déjà OK)
- Ollama : `llama3.2` (plus récent)

### 2. Proxy IA — pas de validation Zod du body
**Fichier** : `reqy-web/app/api/proxy-ai/route.ts`
**Problème** : Le body est cast avec `as ProviderBody`. Pas de validation runtime.

**Correction** : Ajouter un schema Zod et valider `req.json()` avant utilisation.

### 3. Proxy IA — duplication massive entre providers
**Fichier** : `reqy-web/app/api/proxy-ai/route.ts` (~290 lignes)
**Problème** : 6 blocs `if (provider === ...)` avec ~80% de code identique (gestion erreur, parsing JSON, extraction content).

**Correction** : Extraire une fonction `proxyProviderCall` commune qui factorise le pattern fetch → parse → extract content.

### 4. Proxy IA — timeout mal géré
**Fichier** : `reqy-web/app/api/proxy-ai/route.ts`
**Problème** : Le `clearTimeout` est dans `.finally()` mais si la promise est déjà resolved, clearTimeout est retardé. Pas critique mais peut faire fuiter 60s de timeout.

**Correction** : Utiliser `AbortController` + `fetchWithTimeout` pattern standard.

### 5. Cast `as unknown` dangereux dans request-executor
**Fichier** : `reqy-web/lib/request-executor.ts`
**Problème** :
```ts
headers: ({
  "Content-Type": "application/json",
  ...debugHeaders,
  ...(activeWorkspaceId ? { "x-workspace-id": activeWorkspaceId } : {}),
} as unknown) as Record<string, string>,
```

**Correction** : Typer explicitement l'objet comme `Record<string, string>`.

### 6. Appel `store.notify` inexistant
**Fichier** : `reqy-web/hooks/use-ai-engine.ts`
**Problème** :
```ts
store.notify?.(`Erreur IA: ${message}`)
```
Mais `store` vient de `useRequestStore()` cast en `AIRequestStore`, et `AIRequestStore` n'a pas de propriété `notify`.

**Correction** : Remplacer par `store.addNotification?.(...)` qui existe bien dans l'interface.

### 7. `this.db!` non-null assertion dans persistence.ts
**Fichier** : `reqy-web/lib/persistence.ts`
**Problème** : Dans `_migrateFromLocalStorage`, `this.db!` est utilisé alors que `this.db` peut être null (cas où `_init` a échoué).

**Correction** : Vérifier `this.db` avant de l'utiliser dans `_migrateFromLocalStorage`.

## Chunks d'implémentation

### Chunk A : Proxy IA refactor + validation Zod
- **Fichiers** : `reqy-web/app/api/proxy-ai/route.ts`
- **Complexité** : complex (refactor + validation runtime)
- **Acceptance** :
  - [ ] Schema Zod valide le body avec messages d'erreur explicites
  - [ ] Les 6 providers utilisent une fonction helper commune
  - [ ] Les modèles par défaut sont tous valides
  - [ ] Le timeout est géré correctement avec AbortController
  - [ ] `npx tsc --noEmit` passe

### Chunk B : AI Engine + Request Executor fixes
- **Fichiers** : `reqy-web/lib/ai-engine.ts`, `reqy-web/lib/request-executor.ts`
- **Complexité** : simple (corrections ciblées)
- **Acceptance** :
  - [ ] Modèles par défaut corrigés dans `ai-engine.ts`
  - [ ] Cast `as unknown` supprimé dans `request-executor.ts`
  - [ ] `store.notify` remplacé par `store.addNotification` dans `use-ai-engine.ts`
  - [ ] `npx tsc --noEmit` passe

### Chunk C : Persistence safety + tests
- **Fichiers** : `reqy-web/lib/persistence.ts`
- **Complexité** : simple
- **Acceptance** :
  - [ ] `this.db` vérifié avant utilisation dans `_migrateFromLocalStorage`
  - [ ] `npx tsc --noEmit` passe
  - [ ] Tests Vitest passent

## Ordre d'exécution
1. Chunk C (indépendant, renforce la persistance)
2. Chunk B (indépendant, corrections de types)
3. Chunk A (dépend des types corrigés, le plus gros refactor)

## Vérification finale
- `cd reqy-web && npx tsc --noEmit`
- `cd reqy-web && pnpm test run`
- `cd reqy-web && pnpm lint`
