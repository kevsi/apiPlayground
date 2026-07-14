---
name: reqly-design-system
description: Système de design et stack frontend de Reqly (client API local-first, Tauri v2 + Next.js). Couvre Tailwind CSS v4 avec couleurs OKLCH, le système de 7 thèmes CSS variables maison (light/dark/emerald/ocean/sunset/purple/midnight), les tokens sémantiques custom (--success/--warning/--error/--code-*), la typographie Geist, les primitives Radix UI sous shadcn/ui, lucide-react, sonner (toasts), cva + tailwind-merge (cn()), et l'esthétique "API client / terminal" (barre d'URL, pills de méthode HTTP, animations GPU). À utiliser IMPÉRATIVEMENT dès qu'une tâche touche au style, aux couleurs, aux thèmes, aux composants UI, à l'accessibilité des dialogs/dropdowns, aux icônes, aux toasts, ou à la cohérence visuelle dans reqy-web — même si la demande ne mentionne pas explicitement Tailwind ou shadcn. Se déclenche aussi pour tout audit de conformité UI, tout ajout de composant, ou toute question sur comment styler un élément dans ce projet.
---

# Reqly Design System

Ce skill encode les conventions de style réelles du projet Reqly (`reqy-web`), établies et vérifiées au fil d'audits successifs du code. Il ne décrit pas Tailwind/shadcn/Radix en général — il décrit **comment ce projet précis les utilise**, y compris les pièges déjà rencontrés.

## Vue d'ensemble de la stack

| Domaine           | Techno                                                      | Référence détaillée                 |
| ----------------- | ----------------------------------------------------------- | ----------------------------------- |
| Moteur CSS        | Tailwind CSS v4 (`@import "tailwindcss"`, `@theme inline`)  | `references/tailwind-v4-theming.md` |
| Thèmes            | 7 thèmes CSS variables, classe sur `<html>`/`body`          | `references/tailwind-v4-theming.md` |
| Typographie       | Geist Sans + Geist Mono (Vercel)                            | `references/typography-geist.md`    |
| Composants UI     | shadcn/ui sur primitives Radix UI                           | `references/radix-shadcn.md`        |
| Icônes            | lucide-react (seule lib d'icônes du projet)                 | `references/icons-toasts.md`        |
| Notifications     | sonner                                                      | `references/icons-toasts.md`        |
| Variants/classes  | cva + tailwind-merge via `cn()` (`lib/utils.ts`)            | `references/variants-cn.md`         |
| Esthétique        | "API client / terminal" (URL bar, method pills, animations) | `references/terminal-aesthetic.md`  |
| Stack applicative | Next.js App Router + Tauri v2 (Rust) + pnpm workspace       | `references/stack-nextjs-tauri.md`  |

## Règle d'or n°1 : toujours les tokens sémantiques, jamais les couleurs Tailwind brutes

Le projet déclare `--success`, `--warning`, `--error` (mappés en `bg-success`, `text-warning`, etc. via `@theme inline`) précisément pour que les 7 thèmes s'appliquent correctement aux statuts (succès HTTP, erreurs, warnings). Un audit a trouvé des dizaines d'occurrences de `bg-emerald-500`, `text-red-500`, `border-amber-500` codées en dur dans le projet — ce qui **casse silencieusement** les thèmes `ocean`/`sunset`/`purple`/`midnight` (ces couleurs brutes ne changent jamais, peu importe le thème actif).

**Mapping obligatoire :**

- vert/emerald → `success`
- rouge/red → `destructive` (le projet utilise `--destructive` de shadcn, pas un `--error` séparé, pour rester cohérent avec `button.tsx`)
- amber/orange → `warning`
- bleu (`blue`/`sky`) → laissé tel quel, aucun token "info" n'existe encore dans ce projet — ne pas en inventer un
- violet/purple → généralement une couleur d'identification arbitraire (ex: couleur de workspace choisie par l'utilisateur), pas un statut — vérifier l'intention avant de toucher

Voir `references/tailwind-v4-theming.md` pour la liste complète des tokens et leurs valeurs OKLCH par thème.

## Règle d'or n°2 : le piège `border-{token}/{opacité}` sans `border`

**Erreur déjà rencontrée dans ce projet** : remplacer `border border-emerald-500/30` par `border-success/30` (en supprimant le mot `border` seul par erreur) fait disparaître visuellement la bordure. En Tailwind, `border-{couleur}` définit uniquement la **couleur**, pas l'épaisseur — sans la classe `border` seule (qui pose `border-width: 1px`), la largeur reste à `0` par défaut.

**Toujours vérifier, lors de tout remplacement de couleur de bordure**, que la classe `border` (mot seul) est bien présente à côté de `border-{token}/{opacité}` si l'élément avait une bordure visible avant le changement.

## Règle d'or n°3 : réutiliser les composants shadcn existants, ne jamais les recréer à la main

Un audit de conformité a trouvé plusieurs boutons/badges/skeletons codés à la main (`<button className="...">`, `<span className="bg-red-500/10 ...">`, `<div className="animate-pulse ...">`) qui dupliquent des composants shadcn déjà présents dans `components/ui/` (`Button`, `Badge`, `Skeleton`). Avant d'écrire un nouvel élément stylé à la main :

1. Vérifier s'il existe déjà un composant équivalent dans `components/ui/`
2. Si oui, l'utiliser avec ses variants (`variant="ghost"`, `variant="destructive"`, `size="icon-sm"`, etc.) plutôt que de recréer le style
3. Ne créer un nouveau composant custom que si aucun équivalent shadcn n'existe pour ce cas d'usage

Voir `references/radix-shadcn.md` pour la liste des composants déjà présents et leurs variants.

## Règle d'or n°4 : accessibilité — Dialog/Sheet Radix pour tout overlay modal

Tout panneau qui se comporte comme une modale (bloque l'interaction avec le reste de l'app, doit se fermer avec Escape, doit piéger le focus) doit utiliser `Dialog` ou `Sheet` de `components/ui/`, pas une `<div>` custom avec un backdrop fait main. Un audit a trouvé un panneau latéral (sidebar) avec un backdrop `<div onClick={onClose}>` sans `role`, sans gestion d'Escape, sans focus-trap — un vrai manque d'accessibilité clavier, même si l'intention (un dock permanent, pas une vraie modale) peut justifier de ne pas utiliser `Dialog` complet. Dans ce cas, ajouter au minimum : gestion d'Escape via `useEffect` + `keydown`, et `aria-label` sur le backdrop.

## Quand consulter chaque référence

- **Ajout/modif de couleur, thème, badge de statut** → `tailwind-v4-theming.md`
- **Police, taille de texte, aspect "terminal"** → `typography-geist.md` et `terminal-aesthetic.md`
- **Nouveau composant UI, Dialog/Dropdown/Select/Tabs** → `radix-shadcn.md`
- **Icône, notification/toast** → `icons-toasts.md`
- **Variant de composant, classes conditionnelles** → `variants-cn.md`
- **Barre d'URL, pills de méthode HTTP, animations custom** → `terminal-aesthetic.md`
- **Build, Tauri, structure du monorepo pnpm** → `stack-nextjs-tauri.md`

Charger la référence pertinente avant d'écrire ou modifier du code de style — ne pas se fier uniquement à la connaissance générale de Tailwind/shadcn, car ce projet a des conventions et des pièges spécifiques documentés ci-dessus et dans les fichiers détaillés.
