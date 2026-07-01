# Design Doc — Correction des 5 fragilités techniques Reqly

## Contexte
Application Reqly (Next.js 16 + React 19 + Tauri) — API testing playground.

## Objectif
Corriger 5 fragilités techniques identifiées lors de l'analyse du codebase.

## 5 corrections

### 1. Variable Mapping Pipeline
**Fichiers** : `lib/variable-mapping.ts`, `lib/variable-path.ts`
**Problème** : échec sur réponses non-JSON, pas de validation des chemins, pas de fallback.
**Solution** : pipeline à 3 étapes — `detectContentType` → `validatePath` → `extractValue`. Support JSON/XML/Text/Binary. API rétrocompatible.

### 2. Rate Limiter réutilisable
**Fichiers** : `lib/rate-limiter.ts` (nouveau), `app/api/proxy/route.ts`
**Problème** : implémentation in-memory inline non partageable.
**Solution** : classe abstraite `RateLimiter` + implémentation `InMemoryRateLimiter`. Future-ready pour Redis.

### 3. Factorisation GitHub OAuth helpers
**Fichiers** : `lib/github-auth.ts` (nouveau), `app/api/github-auth/repos/route.ts`, `app/api/github-auth/status/route.ts`
**Problème** : `buildGithubHeaders` dupliqué.
**Solution** : extrait dans `lib/github-auth.ts`, importé par les deux routes.

### 4. Cookie OAuth secure dynamique
**Fichiers** : `app/api/github-auth/route.ts`
**Problème** : `secure: true` hardcodé.
**Solution** : `secure: process.env.NODE_ENV === "production"`.

### 5. Mock Debug guard production
**Fichiers** : `app/api/mock/[...path]/route.ts`
**Problème** : endpoint debug expose state interne en production.
**Solution** : guard `NODE_ENV === "production"` → 403.

## Tests
Écrire des tests unitaires pour les modules créés/modifiés : rate-limiter, variable-mapping, github-auth.

## Non-goals
- Pas de changement d'interface UI
- Pas de nouvelle fonctionnalité métier
- Pas de refactor global (seuls les fichiers concernés sont touchés)
