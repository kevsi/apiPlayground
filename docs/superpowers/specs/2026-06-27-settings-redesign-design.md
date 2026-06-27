# Settings Page Redesign — Design Spec

**Date** : 2026-06-27
**Auteur** : Alexander S.
**Statut** : En revue
**Stack** : Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui + next-themes (déjà présent)

---

## 1. Objectif & Non-objectifs

### 1.1 Objectif

Refonte design complète de `/settings` avec :

1. **Layout deux colonnes** : sidebar gauche fixe (navigation verticale 7 sections) + main content droite (spacieux, aéré).
2. **Nouvelle section "Apparence"** avec 4 features :
   - Sélecteur de thème en cards visuelles (3 principales + dropdown pour les 7 du `theme-provider` existant).
   - Palette de couleur d'accent (5 presets + custom hex) qui override `--primary` via CSS variable.
   - Toggle iOS-style pour activer/désactiver les animations globalement.
   - "Tables View" : sélecteur cosmetic (preview uniquement, stub).
3. **Refonte de la section "Outils connectés"** : grille 3×N de ToolCards, modal d'association pour OAuth.

### 1.2 Non-objectifs (YAGNI)

- ❌ Modifier `theme-provider.tsx` ou `theme-switcher.tsx` existants (on les consomme)
- ❌ Sync des prefs vers Supabase (restent localStorage pour V1)
- ❌ "Tables View" réellement fonctionnel (cosmetic preview uniquement)
- ❌ Linear OAuth réel (stub avec toast "Bientôt disponible")
- ❌ Drag-and-drop pour réorganiser les outils
- ❌ Prévisualisation iframe sandbox pour le thème
- ❌ Calcul auto de `--primary-foreground` selon contraste (V2)
- ❌ Reset to defaults button (V2)
- ❌ Persistance des prefs par utilisateur sur serveur (V2)

### 1.3 Réutilisation de l'existant

- ✅ `theme-provider.tsx` — 7 thèmes déjà supportés : `light`, `dark`, `emerald`, `ocean`, `sunset`, `purple`, `midnight`
- ✅ `theme-switcher.tsx` — non touché
- ✅ `app/globals.css` — on ajoute UNIQUEMENT le bloc `prefers-reduced-motion` + `body[data-animations="off"]`
- ✅ `/api/postman-auth` et `/api/github-auth` — endpoints OAuth réutilisés tels quels
- ✅ `useAuth()` (T2 du précédent ferment) — fournit `user` pour la section Profil
- ✅ `ProfileSection` (T9 du précédent ferment) — réutilisée
- ✅ `persistence` utilitaire (localStorage) — pour les nouvelles prefs
- ✅ shadcn/ui `Dialog`, `Switch`, `Card`, `Button`, `Input`, `Label` — déjà installés

---

## 2. Architecture cible

```
┌─────────────────────────────────────────────────────────────────────┐
│ AppHeader (top bar avec search + notifications)                     │
├──────────────┬──────────────────────────────────────────────────────┤
│              │                                                      │
│  Sidebar     │   Main content                                       │
│  (paramètres)│   ┌────────────────────────────────────────────┐    │
│              │   │  [Titre section + description]             │    │
│  ▣ Apparence │   │                                            │    │
│  ◯ Profil    │   │  ┌──────────┐ ┌──────────┐ ┌──────────┐   │    │
│  ◯ Assistant │   │  │  Card 1  │ │  Card 2  │ │  Card 3  │   │    │
│  ◯ Notifs    │   │  └──────────┘ └──────────┘ └──────────┘   │    │
│  ◯ Import    │   │                                            │    │
│  ◯ Outils    │   │  ┌──────────┐ ┌──────────┐ ┌──────────┐   │    │
│  ◯ Compte    │   │  │  Card 4  │ │  Card 5  │ │  Card 6  │   │    │
│              │   │  └──────────┘ └──────────┘ └──────────┘   │    │
│              │   │                                            │    │
│              │   └────────────────────────────────────────────┘    │
│              │                                                      │
└──────────────┴──────────────────────────────────────────────────────┘
```

---

## 3. Composants & données

### 3.1 Sidebar des sections

**Fichier** : `components/settings/settings-sidebar.tsx`

Ordre des sections (sidebar gauche) :

| Ordre | Section | Icône (lucide) |
|-------|---------|----------------|
| 1 | Apparence | `Palette` |
| 2 | Profil & Sécurité | `User` |
| 3 | Assistant IA | `Sparkles` |
| 4 | Notifications | `Bell` |
| 5 | Import / Export | `Cloud` |
| 6 | Outils connectés | `Plug` |
| 7 | Actions du compte | `ShieldAlert` |

**Spec** :
- Largeur 240px desktop, 60px collapsed
- Items : icône 18px + label 14px
- Active : `bg-primary/8 text-primary` + barre gauche 2px primary
- Sticky vertical
- Section "Actions du compte" destructive séparée par border-top
- Toggle collapse avec icône `ChevronLeft/Right`
- Mobile < 768px : drawer hamburger

### 3.2 Section Apparence (4 sous-features)

#### 3.2.1 Sélecteur de thème

**Fichier** : `components/settings/sections/theme-cards.tsx`

3 cards principales : **Clair**, **Sombre**, **Système**
+ dropdown "Plus de thèmes" : emerald, ocean, sunset, purple, midnight (les 4 autres thèmes du `theme-provider`)

- Aperçu live : miniature SVG inline (sidebar + cards) avec les couleurs du thème
- Active : `border-2 border-primary` + check icon + scale 1.02
- Click → `setTheme(theme)` via `useTheme()` existant
- Aucune modification du `theme-provider.tsx`

#### 3.2.2 Palette couleur d'accent

**Fichier** : `components/settings/sections/accent-picker.tsx`

- 5 cercles cliquables : `#000000`, `#EF4444`, `#10B981`, `#3B82F6`, `#8B5CF6`
- Input hex avec validation pattern `#[0-9A-Fa-f]{6}`
- Bouton "Appliquer" → `document.documentElement.style.setProperty("--primary", value)`
- Persiste `localStorage["reqly-accent"]`

#### 3.2.3 Toggle animations

**Fichier** : `components/settings/sections/animations-toggle.tsx`

- Switch shadcn restylé iOS : track 51×31px, thumb 27×27px, primary `#3B82F6` quand actif
- Toggle = `body[data-animations="off"]` + persist `localStorage["reqly-animations"]`
- Description : "Recommandé pour l'accessibilité"

#### 3.2.4 Tables View preview (cosmetic)

**Fichier** : `components/settings/sections/tables-view-preview.tsx`

- 3 vignettes SVG : Compact (24px row), Confortable (32px), Spacieux (40px)
- Click → toast "Aperçu uniquement"
- Pas de persistance

### 3.3 Section Outils connectés

**Fichier** : `components/settings/sections/tools-section.tsx`

**Grille 3×N** de ToolCards :

| Tool | Endpoint OAuth | Logo (emoji) | Description | Status initial |
|------|----------------|--------------|-------------|----------------|
| Postman | `/api/postman-auth` | 📮 | Import/export collections | depuis `/api/postman-auth/status` |
| GitHub | `/api/github-auth` | 🐙 | Repos + gists | depuis `/api/github-auth/status` |
| Linear | (stub) | ⚡ | Tickets (bêta) | toujours disconnected |

**ToolCard spec** :
- Card shadcn `Card`, padding 20px
- Header : emoji 32px + nom 16px semibold
- Description : 13px muted, 1 ligne ellipsis
- Footer : badge status + bouton action
- Status connecté : badge vert `bg-emerald-500/15 text-emerald-700`
- Status déconnecté : badge gris `bg-muted`
- Bouton :
  - Connecté → "Gérer" (modal avec options)
  - Déconnecté → "Associer" (modal OAuth)

### 3.4 Modal d'association

**Fichier** : `components/settings/sections/tool-association-modal.tsx`

```
┌─────────────────────────────────────────────────┐
│  Associer GitHub                          [✕]   │
│  ─────────────────────────────────────────────  │
│                                                 │
│  [logo 48px]  GitHub                            │
│               Accès à vos repositories et gists │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │  Autorisations demandées :                │  │
│  │  • Lecture de vos repositories            │  │
│  │  • Lecture de votre profil                │  │
│  │  • Création de gists                      │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  [Annuler]              [Associer GitHub →]    │
└─────────────────────────────────────────────────┘
```

- shadcn `Dialog`, max-width 500px
- Liste scopes statique par tool
- Pour Postman/GitHub : `window.location.href = tool.oauthUrl` (l'endpoint OAuth gère la redirection complète)
- Pour Linear (stub) : toast "Bientôt disponible", modal se ferme

### 3.5 Hooks custom

#### `hooks/use-animations.ts`
```ts
interface UseAnimationsReturn {
  enabled: boolean
  toggle: () => void
  setEnabled: (v: boolean) => void
}
```
- Read initial depuis `localStorage["reqly-animations"]` ou fallback `!prefers-reduced-motion`
- Applique `body[data-animations="off"]` au mount + sur changement
- SSR-safe (window/document guards)

#### `hooks/use-accent.ts`
```ts
interface UseAccentReturn {
  accent: string | null
  setAccent: (hex: string | null) => void
  isPreset: (hex: string) => boolean
  presets: typeof ACCENT_PRESETS
}
```
- Validation `HEX_REGEX = /^#[0-9A-Fa-f]{6}$/`
- `setAccent(null)` reset au défaut
- `setAccent` rejette silencieusement les valeurs invalides (sécurité)

### 3.6 Layout `<SettingsLayout>`

**Fichier** : `components/settings/settings-layout.tsx`

```tsx
<div className="flex h-full gap-6">
  <SettingsSidebar active={active} onChange={onChange} collapsed={collapsed} onToggleCollapse={...} />
  <main className="flex-1 min-w-0 overflow-y-auto px-4 py-6 lg:px-10 lg:py-8">
    <div className="mx-auto max-w-5xl">{children}</div>
  </main>
</div>
```

---

## 4. Flux & comportements

### 4.1 Cycle de vie d'une pref

```
[App boot]
    │
    ▼
Mount du hook (useAnimations / useAccent)
    │
    ▼
useEffect → read localStorage
    │
    ▼
apply to DOM (body attribute / style.setProperty)
    │
    ▼
[User interagit : click circle / toggle]
    │
    ▼
setAccent / setEnabled
    │
    ├── update React state
    ├── update DOM (immediate)
    └── persist localStorage
```

### 4.2 Flux modal OAuth (Postman/GitHub)

```
[User click "Associer GitHub" sur ToolCard]
    │
    ▼
ToolAssociationModal s'ouvre (controlled state)
    │
    ▼
[User review scopes, click "Associer GitHub →"]
    │
    ▼
window.location.href = "/api/github-auth"
    │
    ▼
Browser redirige vers /api/github-auth
    │
    ▼
Server initie OAuth flow (existant, non touché)
    │
    ▼
User authentifie sur GitHub
    │
    ▼
Redirect vers /api/github-auth/callback (existant)
    │
    ▼
Cookie github_token set, redirect vers /settings#integrations
    │
    ▼
Modal fermée, ToolCard refresh status (connected)
```

### 4.3 Comportement erreurs

| Cas | Comportement |
|-----|--------------|
| `setAccent("#XYZ")` | Toast "Format hex invalide", pas de changement |
| `setAccent("red")` (sans #) | Idem |
| localStorage disabled | Toast warning, state reste en mémoire |
| OAuth callback échoue | Le serveur redirige vers `/settings?auth_error=...` (comportement existant) |
| Modal fermée pendant OAuth (clic externe) | Modal ferme, le flow OAuth continue en background |
| Multiple modales ouvertes | Une seule à la fois (controlled state) |

### 4.4 États loading

| Composant | Pendant le load |
|-----------|-----------------|
| ThemeCards | Affiche les 3 cards avec le thème courant immédiatement |
| AccentPicker | 5 cercles rendus immédiatement |
| AnimationsToggle | Switch à l'état lu depuis localStorage (pas de loading) |
| ToolCard (Postman/GitHub) | Pendant le fetch status : skeleton circle sur le badge |

---

## 5. Critères de succès

### 5.1 Critères observables

| # | Critère | Vérifiable par |
|---|---------|----------------|
| C1 | `/settings` sidebar 7 sections (Apparence, Profil, Assistant, Notifications, Import, Outils, Compte) | Visuel |
| C2 | Click sidebar change section avec animation fade+slide 200ms | Visuel |
| C3 | Section Apparence montre 4 sous-sections (Thème, Accent, Animations, Tables view) | Visuel |
| C4 | Click ThemeCard (Clair/Sombre/Système) applique le thème réellement | DevTools class + reload |
| C5 | Click cercle accent applique la couleur (CSS var `--primary` change sur `<html>`) | DevTools inspect |
| C6 | Toggle animations off désactive toutes les transitions | Tester hover avant/après |
| C7 | Section Outils affiche grille 3×N de ToolCards (Postman, GitHub, Linear) | Visuel |
| C8 | Click "Associer" ouvre ToolAssociationModal avec scopes | Visuel |
| C9 | Modal Postman/GitHub redirige vers endpoint OAuth existant, flow complet OK | Test E2E |
| C10 | Modal Linear affiche "Bientôt disponible" sans appel réseau | Click + toast |
| C11 | Thème "Système" suit `prefers-color-scheme` | DevTools rendering |
| C12 | `prefers-reduced-motion: reduce` force animations off au premier load | DevTools emulate + reload |

### 5.2 Tests automatisés

**Unit** :
- `hooks/__tests__/use-animations.test.tsx` — 4 cas (start enabled, start disabled si reduced-motion, toggle, setEnabled)
- `hooks/__tests__/use-accent.test.tsx` — 6 cas (start null, setAccent valid hex, setAccent invalid no-op, setAccent(null) clear, isPreset, HEX_REGEX)

### 5.3 Tests manuels E2E (10 scénarios)

| # | Scénario | Résultat attendu |
|---|----------|------------------|
| M1 | Refresh /settings sans auth | 7 sections sidebar, "Apparence" actif par défaut |
| M2 | Click "Profil & Sécurité" sidebar | Section change avec animation |
| M3 | Apparence → click card "Sombre" | Thème dark appliqué, reload conserve |
| M4 | Apparence → click cercle violet | Primary devient violet sur toute l'app |
| M5 | Toggle Animations off → hover sidebar item | Aucune transition visible |
| M6 | DevTools emulate `prefers-reduced-motion: reduce` + reload | Toggle Animations démarre à off |
| M7 | Outils → click "Associer" sur carte GitHub | Modal ouvre avec scopes (repo read:user) |
| M8 | Modal GitHub → click "Associer GitHub →" | Redirection vers `/api/github-auth` |
| M9 | Outils → click "Associer" sur carte Linear | Toast "Bientôt disponible", modal ferme |
| M10 | Refresh avec accent + animations off en localStorage | Pas de flash, prefs appliquées avant premier paint |

### 5.4 Definition of Done

1. ✅ Critères C1-C12 vérifiables manuellement
2. ✅ Tests unitaires `use-animations` (4) + `use-accent` (6) passent (`pnpm test`)
3. ✅ `npx tsc --noEmit` aucune nouvelle erreur
4. ✅ Aucun fichier `/api/*` modifié
5. ✅ `globals.css` reçoit UNIQUEMENT le bloc animations (rien d'autre touché)
6. ✅ `theme-provider.tsx` et `theme-switcher.tsx` non modifiés
7. ✅ Spec + plan d'implémentation commités

---

## 6. Plan d'implémentation (résumé)

**Ordre** :
1. CSS additionnel dans `globals.css` (animations off)
2. Hooks `use-animations` + tests
3. Hook `use-accent` + tests
4. Composants Apparence (4 features) + tests visuels manuels
5. `ToolAssociationModal`
6. `ToolsSection` (grille 3×N)
7. `SettingsSidebar` + `SettingsLayout`
8. Refonte `app/settings/page.tsx` (wrap dans SettingsLayout)
9. Build + manual smoke

**Estimation** : ~4-5 heures.

**Risques** :
- Faible : `app/settings/page.tsx` est gros (~390 lignes), refonte nécessite soin
- Moyen : conflit potentiel avec d'autres usages de `--primary` (mitigé par override via `style` attribute sur `<html>`)
- Faible : performance du re-render sur changement de thème (mitigé par memo existant)

---

## 7. Hors-scope Phase 2

- Sync des prefs vers Supabase user_settings
- "Tables View" réellement fonctionnel (quand il y aura des tables à styler)
- Linear OAuth réel
- Reset to defaults button
- Drag-and-drop réorganisation des outils
- Prévisualisation iframe sandbox du thème
- Variables CSS `--primary-foreground` calculées selon contraste
- Listening live à `prefers-reduced-motion` (changement mid-session)
