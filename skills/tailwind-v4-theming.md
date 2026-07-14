# Tailwind CSS v4 + Système de thèmes — Reqly

## Moteur Tailwind v4

Le projet utilise la syntaxe v4 (pas de `tailwind.config.js` classique pour le thème) :

```css
@import "tailwindcss";

@theme inline {
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-destructive: var(--destructive);
  /* ... autres mappings token → utility Tailwind */
}
```

`@theme inline` est ce qui transforme une variable CSS (`--success`) en classe utilitaire Tailwind (`bg-success`, `text-success`, `border-success`). Sans cette déclaration dans `@theme inline`, une variable CSS custom n'est PAS utilisable comme classe Tailwind.

**Avant d'utiliser un nouveau token dans une classe**, vérifier qu'il est bien mappé dans le bloc `@theme inline` de `app/globals.css` — sinon la classe ne générera rien (silencieusement, sans erreur de build).

## Les 7 thèmes

Déclarés dans `app/globals.css`, chacun redéclare le jeu complet de tokens :

| Thème          | Sélecteur         | Notes |
| -------------- | ----------------- | ----- |
| Light (défaut) | `:root`, `.light` |       |
| Dark           | `.dark`           |       |
| Emerald        | `.emerald`        |       |
| Ocean          | `.ocean`          |       |
| Sunset         | `.sunset`         |       |
| Purple         | `.purple`         |       |
| Midnight       | `.midnight`       |       |

Le thème actif est appliqué via une classe sur `<html>` ou `<body>` (voir `theme-switcher.tsx` pour le mécanisme de bascule). Toutes les couleurs OKLCH — Tailwind v4 encourage OKLCH pour une meilleure interpolation perceptuelle des couleurs, notamment en mode sombre.

## Tokens sémantiques custom

En plus des tokens shadcn standards (`--background`, `--foreground`, `--primary`, `--muted`, `--border`, `--destructive`, etc.), le projet ajoute :

| Token       | Usage                                                                                                                                   | Classe Tailwind générée                        |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `--success` | États de succès (2xx HTTP, tests passés, actions confirmées)                                                                            | `bg-success`, `text-success`, `border-success` |
| `--warning` | États d'avertissement (4xx HTTP, tests skippés, confirmations requises)                                                                 | `bg-warning`, `text-warning`, `border-warning` |
| `--error`   | Déclaré mais le projet utilise en pratique `--destructive` (shadcn) pour le rouge, par cohérence avec `button.tsx` qui l'utilisait déjà | voir note ci-dessous                           |
| `--code-*`  | Coloration syntaxique / affichage de code (JSON, headers)                                                                               | `bg-code-*`, `text-code-*` selon déclaration   |

**Note sur error vs destructive** : ce projet a DEUX tokens qui pourraient représenter le rouge (`--error` et `--destructive`). La convention retenue après audit : utiliser `destructive` pour tout ce qui touche à des actions/statuts destructifs ou des erreurs de statut HTTP (5xx, échecs), car c'est déjà la convention de `components/ui/button.tsx` (`variant="destructive"`). Ne pas introduire `error` en parallèle sauf si un cas d'usage distinct l'exige clairement.

## Mapping couleur brute → token sémantique

Lors de tout remplacement d'une couleur Tailwind brute par un token :

```
emerald-*, green-*     → success
red-*                  → destructive
amber-*, orange-*      → warning
blue-*, sky-*, cyan-*  → PAS DE TOKEN — laisser tel quel (statut "info" non tokenisé actuellement)
violet-*, purple-*     → généralement une couleur d'IDENTIFICATION ARBITRAIRE (workspace, catégorie
                          utilisateur), PAS un statut sémantique — vérifier le contexte avant de
                          remplacer. Si utilisé pour un vrai statut, demander confirmation avant
                          de choisir un mapping.
```

**Cas particulier confirmé par audit** : `components/workspace-selector.tsx` définit une palette de couleurs (`slate/emerald/blue/amber/purple/red`) que l'utilisateur choisit pour identifier visuellement CHAQUE workspace — ce ne sont pas des couleurs de statut, ne jamais les remapper vers les tokens sémantiques.

## Piège n°1 : `border-{token}/{opacité}` sans la classe `border`

Voir la règle d'or n°2 du SKILL.md principal. Rappel du pattern correct :

```html
<!-- INCORRECT — bordure invisible (width: 0 par défaut) -->
<div className="rounded-lg border-success/30 bg-success/10 p-3">
  <!-- CORRECT — border (width 1px) + border-success/30 (couleur) -->
  <div className="rounded-lg border border-success/30 bg-success/10 p-3"></div>
</div>
```

Toujours vérifier ce point spécifiquement lors d'un remplacement en masse de couleurs (recherche/remplace ou diff automatisé) — c'est une régression silencieuse, aucune erreur de build ne la signale.

## Piège n°2 : opacité et suffixes

`bg-success/10` = fond avec 10% d'opacité du token `--success`. `bg-success/20`, `/30` etc. suivent la même logique. Un badge de statut typique utilise généralement `bg-{token}/10` + `text-{token}` (sans opacité sur le texte, pour rester lisible) + `border border-{token}/30` (opacité intermédiaire pour un contour discret).

## Vérification avant tout changement de couleur

1. Le token cible existe-t-il dans `@theme inline` de `app/globals.css` ?
2. La couleur remplacée est-elle un statut sémantique (success/warning/destructive) ou une identification arbitraire (à laisser telle quelle) ?
3. Si la classe originale avait `border` (mot seul) en plus de la couleur, le nouveau code le conserve-t-il ?
4. Tester visuellement avec au moins 2 thèmes différents (le défaut + un thème custom comme `ocean`) après tout changement de couleur — un remplacement correct dans le code peut quand même mal rendre si le token n'a pas de valeur déclarée dans TOUS les thèmes.
