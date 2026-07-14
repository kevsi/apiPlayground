# Typographie — Geist (Vercel)

## Polices déclarées

| Variable CSS        | Police     | Usage                                                                |
| ------------------- | ---------- | -------------------------------------------------------------------- |
| `--font-geist-sans` | Geist Sans | Texte UI général, labels, prose                                      |
| `--font-geist-mono` | Geist Mono | Aspect "terminal / client API" — URLs, code, JSON, headers HTTP, IDs |

## Où utiliser Geist Mono spécifiquement

Vu l'esthétique "API client / terminal" du projet (voir `terminal-aesthetic.md`), Geist Mono doit être utilisé pour :

- La barre d'URL de requête (`.url-command`)
- Le corps de réponse HTTP (JSON, XML, texte brut)
- Les noms de headers et leurs valeurs
- Les tokens/clés API affichés (masqués ou non)
- Les IDs de ressources (collection ID, request ID, connection ID WebSocket)
- Les blocs de code dans la documentation générée ou les snippets d'export (curl, fetch)

Ne PAS utiliser Geist Mono pour : les labels de boutons, les titres de section, la prose descriptive (analyse IA, messages de chat) — cela reste en Geist Sans pour la lisibilité.

## Classe Tailwind

Généralement exposé via une classe utilitaire type `font-mono` (mappée sur `--font-geist-mono` dans la config Tailwind/theme) et `font-sans` (défaut, mappé sur `--font-geist-sans`). Vérifier la déclaration exacte dans `app/layout.tsx` (chargement des fonts via `next/font/local` ou `next/font/google` selon la méthode d'intégration) avant de supposer le nom de classe exact si non trouvé directement.

## Cohérence avec l'esthétique terminal

Combiner `font-mono` avec un fond légèrement distinct (`bg-muted/30` ou équivalent) et un padding généreux renforce l'aspect "console" recherché pour les zones de contenu technique — cohérent avec le pattern déjà observé dans `AssistantStepsRenderer` (zone de détail repliée en `text-xs` avec bordure gauche façon citation).
