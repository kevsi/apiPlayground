# Radix UI + shadcn/ui — Reqly

## Principe

shadcn/ui n'est pas une librairie installée via npm — ce sont des composants générés dans `components/ui/` (pattern standard de la CLI shadcn), qui enveloppent des primitives **Radix UI** pour l'accessibilité (focus-trap, ARIA, gestion clavier) et utilisent `cva` pour les variants (voir `variants-cn.md`).

**Règle absolue : ne jamais réimplémenter à la main un composant qui existe déjà dans `components/ui/`.**

## Composants confirmés conformes (vérifiés par audit)

| Composant | Fichier                    | Statut                                                                                                                                                                                    |
| --------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`  | `components/ui/button.tsx` | ✅ Conforme — cva complet, variants `default/destructive/outline/secondary/ghost/link`, tailles incluant `icon`/`icon-sm`/`icon-lg`, support `asChild` (Slot Radix), `data-slot="button"` |
| `Input`   | `components/ui/input.tsx`  | ✅ Conforme — `data-slot="input"`, `w-full min-w-0` (corrige un bug de curseur système déjà rencontré), `aria-invalid`/`focus-visible:ring`                                               |
| `Dialog`  | `components/ui/dialog.tsx` | ✅ Utilisé correctement dans `AIModal.tsx` (focus-trap + ARIA gérés par Radix)                                                                                                            |

## Écarts déjà trouvés (à éviter de reproduire)

Un audit de conformité a trouvé ces anti-patterns dans le code existant — ne pas les reproduire ailleurs :

1. **Boutons faits main** au lieu de `<Button variant="ghost" size="icon-sm">` — des `<button className="flex size-7 items-center justify-center rounded-md hover:bg-accent">` dispersés dans plusieurs composants IA. Toujours vérifier si un variant `Button` existant couvre le besoin avant d'écrire un `<button>` custom.

2. **Badge codé à la main** — un composant de sévérité utilisant un `<span>` stylé en dur au lieu du composant `Badge` de `components/ui/`. `Badge` existe et est déjà importé dans plus de 15 fichiers du projet — toujours vérifier son existence avant de recréer un badge.

3. **Skeleton dupliqué** — des classes CSS custom (`.skeleton`, `.skeleton-loader`) et des `<div className="animate-pulse rounded bg-muted">` bruts, alors que `components/ui/skeleton.tsx` existe déjà (`bg-accent animate-pulse rounded-md`). Toujours utiliser `<Skeleton>` pour tout placeholder de chargement.

4. **Overlay custom sans accessibilité Radix** — un panneau latéral (sidebar) avec un backdrop `<div onClick={onClose}>` fait main, sans `role`, sans gestion d'Escape au clavier, sans focus-trap. Si l'élément se comporte comme une vraie modale, utiliser `Dialog` ou `Sheet`. Si c'est un dock permanent qui ne doit PAS bloquer toute l'interaction (cas légitime), au minimum ajouter la gestion d'Escape via `useEffect`/`keydown` et un `aria-label` sur le backdrop.

## Avant d'écrire un nouveau composant UI

1. Chercher dans `components/ui/` si un composant équivalent existe déjà (`grep -r` sur le nom probable, ou lister le dossier)
2. Si oui, vérifier ses variants disponibles (`cva` dans le fichier) avant de personnaliser par des classes brutes
3. Si le composant doit avoir un comportement de type overlay/modal/dropdown, partir d'une primitive Radix existante (`Dialog`, `Popover`, `DropdownMenu`, `Select`, `Tabs`) plutôt que de gérer soi-même l'état ouvert/fermé + le focus + les clics extérieurs
4. Ne créer un composant 100% custom que si aucune primitive Radix/shadcn ne couvre le besoin (cas rare — la plupart des besoins UI standards sont déjà couverts)

## Recherche rapide de composants existants

```bash
ls reqy-web/components/ui/
grep -rl "from \"@/components/ui/badge\"" reqy-web/
```
