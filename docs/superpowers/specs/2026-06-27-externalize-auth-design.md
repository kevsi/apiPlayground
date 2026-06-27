# Externalisation de l'authentification — Design Spec

**Date** : 2026-06-27
**Auteur** : Alexander S.
**Statut** : En revue
**Stack** : Next.js (App Router) + TypeScript + Supabase + shadcn/ui

---

## 1. Objectif & Non-objectifs

### 1.1 Objectif

Sortir l'authentification du formulaire interne à `/settings` et la rendre :

1. **Visible** — Le widget utilisateur du sidebar (aujourd'hui décoratif "Nurul's Zone" hardcodé) reflète la vraie session de l'utilisateur.
2. **Centralisée** — Une page dédiée `/login` (split-pane, plein écran, hors sidebar) devient le point d'entrée unique pour la connexion, avec trois options : Google, GitHub, email + password.
3. **Complète** — Une page `/signup` distincte pour la création de compte.
4. **Sûre** — Le path de redirection après login est validé pour bloquer les open redirects.
5. **Riche côté Profil** — Une section Profil étoffée dans `/settings` regroupe : aperçu read-only, édition nom/avatar, changement de mot de passe, 2FA (stub), zone dangereuse (suppression de compte).

### 1.2 Non-objectifs (YAGNI)

- ❌ Réécrire le backend auth (les routes `/api/auth/*` et `/api/github-auth/*` existantes restent intactes)
- ❌ Ajouter d'autres providers OAuth (LinkedIn, Microsoft, etc.)
- ❌ Page "Mot de passe oublié" (peut être ajoutée plus tard sans casser l'API)
- ❌ Magic link / passwordless
- ❌ 2FA réellement fonctionnelle (UI stub uniquement avec badge "Bientôt disponible")
- ❌ Upload d'avatar custom (on reste sur DiceBear seed uniquement)
- ❌ Suppression réelle du compte en backend pour la V1 (la zone dangereuse affiche la confirmation puis un toast — voir §5.4)
- ❌ Refresh token automatique silencieux (le cookie vit 30j, suffit)

### 1.3 Réutilisation de l'existant

Le backend auth est **le substrat** :

- ✅ `/api/auth/signup`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/status` → conservés
- ✅ `/api/auth/callback` (Supabase OAuth) → conservé, continue de rediriger vers `/auth/callback` (page navigateur) qui appelle `/api/auth/exchange`
- ✅ `/api/github-auth/*` (intégration GitHub pour import de repos) → **conservé tel quel**, distinct du login GitHub
- ✅ `hooks/use-sync.ts` continue d'appeler `/api/auth/status` avant chaque sync
- ✅ Cookie `auth_session` (HMAC-SHA256, 30j, httpOnly, sameSite=lax) → conservé
- 🆕 Nouveau : `hooks/use-auth.ts` (hook React pur, sans dépendance Zustand)
- 🆕 Nouveau : `lib/redirect.ts` (validation safe redirect)
- 🆕 Nouveau : `app/login/page.tsx`, `app/signup/page.tsx`, `components/login/*`, `components/sidebar/user-menu.tsx`

---

## 2. Architecture cible

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Sidebar (global, sur toutes les pages authentifiées)                     │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │  État déconnecté :                                          │           │
│  │  [🔵 Se connecter]                                          │           │
│  │       │                                                     │           │
│  │       ▼                                                     │           │
│  │  /login?redirect=/page-courante  (split-pane, hors sidebar) │           │
│  │                                                             │           │
│  │  État connecté :                                            │           │
│  │  [👤]  Nurul Akhter  ⌄                                       │           │
│  │       │                                                     │           │
│  │       ▼                                                     │           │
│  │  Dropdown : Mon profil → /settings#profile                   │           │
│  │             Se déconnecter → POST /api/auth/logout           │           │
│  └─────────────────────────────────────────────────────────────┘           │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│  Pages d'auth (pas de sidebar)                                            │
│                                                                            │
│  /login :  ┌─ Branding/Visuel ─┬─ Formulaire ─────────────────────┐        │
│            │  Logo + tagline    │  [Google]  [GitHub]              │        │
│            │  Illustration      │  ─── ou email ───                │        │
│            │  (gradient + dot)  │  email    [____________]         │        │
│            │                    │  password [____________] 👁       │        │
│            │                    │  [ Se connecter ]                 │        │
│            │                    │  Pas de compte ? S'inscrire      │        │
│            └────────────────────┴──────────────────────────────────┘        │
│                                                                            │
│  /signup : même layout + champs nom + confirm password                    │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│  /settings  (sidebar + nav verticale settings)                             │
│                                                                            │
│  Sections conservées :  IA, Intégrations, Notifications, …                 │
│  Section remplacée :    PROFIL (refonte complète, voir §3.4)               │
│  Section supprimée :    ACCOUNT (formulaires auth déplacés vers /login)    │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Composants & données

### 3.1 Nouveau hook `useAuth()`

**Fichier** : `reqy-web/hooks/use-auth.ts`

```ts
"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

export type AuthStatus = "loading" | "connected" | "disconnected"
export type AuthProvider = "local" | "google" | "github"

export interface AuthUser {
  email: string
  name: string
  provider: AuthProvider
}

export interface UseAuthReturn {
  status: AuthStatus
  user: AuthUser | null
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const STATUS_URL = "/api/auth/status"
const LOGOUT_URL = "/api/auth/logout"

export function useAuth(): UseAuthReturn { /* cf. section 3.1 du brainstorming */ }
```

**Garanties** :
- `status === "loading"` pendant le premier fetch → squelette dans le sidebar (pas de flash)
- `refresh()` exposé pour `/login` après login
- `logout()` met à jour l'état local + `router.refresh()`
- Pas de dépendance Zustand → zéro régression sur les stores existants

### 3.2 `safeRedirect()` — validation du paramètre `?redirect=`

**Fichier** : `reqy-web/lib/redirect.ts`

```ts
const SAFE_REDIRECT = /^\/[a-zA-Z0-9_\-/]*(?:\?[^#]*)?(?:#.*)?$/

export function safeRedirect(input: string | null | undefined, fallback = "/"): string {
  if (!input) return fallback
  if (input.includes("//") || /^[a-z]+:/i.test(input)) return fallback
  if (!SAFE_REDIRECT.test(input)) return fallback
  return input
}
```

**Bloque** : `//evil.com`, `https://evil.com`, `javascript:alert(1)`, `file:///etc/passwd`, `../../etc/passwd`

### 3.3 Sidebar widget dynamique

**Fichier modifié** : `reqy-web/components/api-sidebar.tsx`

**État déconnecté** :
```tsx
<Button
  variant="default"
  size="sm"
  className="w-full"
  onClick={() => router.push(`/login?redirect=${encodeURIComponent(pathname)}`)}
>
  <LogIn className="mr-2 size-4" />
  Se connecter
</Button>
```

**État connecté** :
```tsx
<UserMenu user={user} onLogout={logout} />
```
où `UserMenu` est un nouveau composant (`components/sidebar/user-menu.tsx`) qui encapsule le DropdownMenu Radix.

**État loading** : skeleton rectangle gris `bg-muted h-8 w-full`.

### 3.4 Page Profil dans `/settings`

**Fichier** : `reqy-web/components/settings/profile-section.tsx` (refonte complète)

**Structure** :

```
Profil
├── Aperçu du compte (Card read-only)
│   ├── Avatar 64px (DiceBear avec seed = email ou choisi)
│   ├── Nom + email
│   ├── Badge provider (Google/GitHub/Email)
│   └── "Membre depuis le JJ mois AAAA"
├── Modifier mes informations (Card)
│   ├── Input "Nom complet"
│   ├── Input "Avatar seed" + bouton "🎲 Régénérer" + preview live
│   └── Bouton "Enregistrer"
├── Changer mon mot de passe (Card)
│   ├── Input "Mot de passe actuel" (toggle visibilité)
│   ├── Input "Nouveau mot de passe"
│   ├── Input "Confirmer"
│   └── Bouton "Changer"
├── Sécurité (Card)
│   └── Switch "Authentification à 2 facteurs" disabled + badge "Bientôt disponible"
└── Zone dangereuse (Card border-destructive)
    └── Bouton "Supprimer mon compte" → AlertDialog avec champ "SUPPRIMER" à taper
```

### 3.5 Pages `/login` et `/signup`

**Fichiers** :
- `reqy-web/app/login/page.tsx`
- `reqy-web/app/signup/page.tsx`
- `reqy-web/components/login/login-layout.tsx` (split-pane shell)
- `reqy-web/components/login/login-form.tsx` (form login)
- `reqy-web/components/login/signup-form.tsx` (form signup)

**Layout split-pane** :
- Desktop : 50/50 (gauche branding, droite form), `min-h-screen`
- Mobile < 768px : gauche devient bandeau 200px en haut, form en dessous
- Pas de sidebar ni header sur ces pages
- Animation fade-in 200ms

**Formulaire** :
- Boutons OAuth (Google, GitHub) appellent `supabase.auth.signInWithOAuth` (chemin existant)
- Form email/password appelle `POST /api/auth/login` ou `POST /api/auth/signup`
- Lien cross : `?redirect=` préservé
- Si déjà connecté au mount → auto-redirect

### 3.6 Routes & fichiers impactés

**Créer (9)** :
```
reqy-web/app/login/page.tsx
reqy-web/app/signup/page.tsx
reqy-web/components/login/login-layout.tsx
reqy-web/components/login/login-form.tsx
reqy-web/components/login/signup-form.tsx
reqy-web/components/sidebar/user-menu.tsx
reqy-web/hooks/use-auth.ts
reqy-web/lib/redirect.ts
reqy-web/hooks/__tests__/use-auth.test.ts
reqy-web/lib/__tests__/redirect.test.ts
```

**Modifier (3)** :
```
reqy-web/components/api-sidebar.tsx          # widget dynamique
reqy-web/app/settings/page.tsx               # retrait AccountSection + handlers signup/login
reqy-web/components/settings/profile-section.tsx  # refonte complète
```

**Supprimer logique (0)** : aucun fichier backend supprimé.

---

## 4. Flux & comportements

### 4.1 Cycle de vie d'une session

```
[App boot]
    │
    ▼
useAuth() mount → fetch /api/auth/status
    │
    ├── connected ──► render UI authentifiée
    │
    └── disconnected ──► render UI "Se connecter"
                              │
                              ▼
                    [User clique "Se connecter"]
                              │
                              ▼
                    navigate /login?redirect=/current
                              │
                              ▼
                    [User submit form]
                              │
                              ├── email/password ──► POST /api/auth/login
                              │                          │
                              │                          ├── ok ──► refresh() + safeRedirect
                              │                          └── ko ──► toast, stay
                              │
                              └── OAuth ──► supabase.auth.signInWithOAuth
                                                 │
                                                 ▼
                                       redirect provider
                                                 │
                                                 ▼
                                       /auth/callback (browser)
                                                 │
                                                 ▼
                                       POST /api/auth/exchange
                                                 │
                                                 ▼
                                       refresh() + safeRedirect
```

### 4.2 Gestion des erreurs

| Source | Erreur | Comportement UI |
|--------|--------|-----------------|
| `GET /api/auth/status` | Network/500 | `status = "disconnected"`, aucun toast |
| `POST /api/auth/login` | 400 email/password | Toast + message inline sous le champ |
| `POST /api/auth/login` | 500 | Toast "Erreur serveur, réessayez" |
| `POST /api/auth/signup` | 400 email pris | Toast "Cet email est déjà utilisé" + lien /login |
| `POST /api/auth/signup` | 200 sans session | Toast "Vérifiez votre email" + redirect /login |
| OAuth callback | `?error=` URL | Redirect `/settings?auth_error=<msg>` (préservé) |
| OAuth callback | State mismatch | Toast "Session expirée, réessayez" sur /login |
| `POST /api/auth/logout` | Network | Toast warning, local state cleared quand même |

### 4.3 États loading

| Composant | Pendant `status === "loading"` |
|-----------|-------------------------------|
| Sidebar widget | Skeleton gris 32px |
| `/login` | Formulaire visible mais bouton submit désactivé |
| `/settings` Profile | Si `disconnected` → message "Connectez-vous pour voir votre profil" + CTA |

### 4.4 Comportement suppression de compte (zone dangereuse)

**V1 (présente spec)** :
1. User clique "Supprimer mon compte"
2. AlertDialog s'ouvre avec message d'avertissement + champ texte "Tapez SUPPRIMER pour confirmer"
3. User tape "SUPPRIMER" + clique "Confirmer"
4. Toast : "Fonctionnalité de suppression en cours d'implémentation. Contactez le support."
5. Pas d'appel backend pour V1.

**Note** : la suppression réelle (DELETE sur Supabase auth.users + cascade sur tables user-owned) est **hors scope V1**. Voir §1.2.

---

## 5. Critères de succès

### 5.1 Critères observables

| # | Critère | Vérifiable par |
|---|---------|----------------|
| C1 | Sidebar affiche "Se connecter" pour user non-auth, et nom/email/avatar pour user connecté | Visuel |
| C2 | Click sur "Se connecter" → URL = `/login?redirect=<page courante>` | Barre d'adresse |
| C3 | Page `/login` affiche 3 options : Google, GitHub, email/password + lien /signup | Visuel |
| C4 | Login email/password réussi redirige vers `?redirect=` ou `/` | URL + cookie `auth_session` |
| C5 | OAuth Google ET GitHub aboutissent à une session valide | Click → provider → retour → sidebar montre user |
| C6 | `/signup` crée un compte ; si Supabase renvoie session → connexion auto, sinon → toast vérification email | Deux scénarios |
| C7 | Dropdown sidebar : "Mon profil" → `/settings#profile`, "Se déconnecter" déconnecte | Click |
| C8 | Logout : cookie effacé, sidebar revient à "Se connecter", reload préserve | DevTools |
| C9 | `/settings` Profil affiche toutes les sections (read-only, edit, password, 2FA stub, danger) | Visuel |
| C10 | User connecté visitant `/login` ou `/signup` → auto-redirect `/` ou `?redirect=` | Connecter → `/login` → redirect |

### 5.2 Tests automatisés

**Unit** :
- `lib/__tests__/redirect.test.ts` — `safeRedirect` couvre 12 cas (cf. tableau §3.2)
- `hooks/__tests__/use-auth.test.ts` — mock fetch, ~8 cas (loading/connected/disconnected/logout/refresh/focus/storage)

**Composant** :
- `components/sidebar/__tests__/user-menu.test.tsx` — render états + click handlers

### 5.3 Tests manuels (10 scénarios E2E)

| # | Scénario | Résultat attendu |
|---|----------|------------------|
| M1 | Premier lancement déconnecté | Sidebar bottom = "Se connecter" |
| M2 | Click "Se connecter" depuis /collections | URL = `/login?redirect=%2Fcollections` |
| M3 | Login email valide | Redirect /collections + sidebar user |
| M4 | Login email invalide | Toast erreur, form reste |
| M5 | OAuth Google | Retour connecté |
| M6 | Signup nouveau compte | Toast + redirect ou demande vérif email |
| M7 | Dropdown ouvert | 2 items visibles |
| M8 | Logout | Sidebar revient, reload OK |
| M9 | /settings#profile connecté | 5 sections visibles |
| M10 | /login?redirect=//evil.com + login valide | Redirect `/` (pas evil.com) |

### 5.4 Definition of Done

1. ✅ Critères C1-C10 vérifiables par observation manuelle
2. ✅ Tests unitaires `safeRedirect` + `useAuth` passent (`pnpm test`)
3. ✅ Aucun fichier hors `api-sidebar.tsx`, `settings/page.tsx`, `profile-section.tsx` n'est modifié
4. ✅ `pnpm build` passe sans warning nouveau
5. ✅ Smoke tests Playwright existants passent

---

## 6. Plan d'implémentation (résumé)

**Ordre** :
1. Hook `useAuth` + tests unitaires
2. `lib/redirect.ts` + tests unitaires
3. Composant `UserMenu` (dropdown) avec tests
4. Composants `login-layout`, `login-form`, `signup-form`
5. Pages `app/login/page.tsx`, `app/signup/page.tsx`
6. Modification `api-sidebar.tsx` (widget dynamique)
7. Refonte `profile-section.tsx`
8. Modification `settings/page.tsx` (retrait AccountSection)
9. Vérification manuelle des 10 scénarios E2E
10. `pnpm build` + `pnpm test`

**Estimation** : ~6-8 heures de travail pour un développeur connaissant la codebase.

**Risques** :
- Faible : impact isolé à 3 fichiers existants
- Moyen : responsive du split-pane (tester sur plusieurs breakpoints)
- Faible : le state loading pourrait flicker si le fetch est très rapide (mitigé par squelette de hauteur fixe)

---

## 7. Hors-scope Phase 2 (futur)

- Page "Mot de passe oublié" + flow reset
- Magic link via Supabase
- 2FA TOTP réellement fonctionnelle
- Suppression réelle du compte (avec cascade Supabase)
- Avatar upload (vs DiceBear seed)
- Multi-device sessions management
- Login avec providers additionnels
