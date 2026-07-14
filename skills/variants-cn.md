# cva + tailwind-merge (cn()) — Reqly

## L'utilitaire cn()

Défini dans `lib/utils.ts` :

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

`cn()` combine `clsx` (classes conditionnelles) et `tailwind-merge` (résolution des conflits de classes Tailwind — ex: `cn("p-2", condition && "p-4")` résout correctement en gardant seulement `p-4` si `condition` est vrai, plutôt que d'avoir les deux classes en conflit dans le DOM).

**Règle absolue : toute composition de classes conditionnelles doit passer par `cn()`.** Un audit a trouvé 23 fichiers qui composent des classes conditionnelles via template literal (`` `base-class ${condition ? "a" : "b"}` ``) au lieu de `cn()` — ce pattern ne résout pas les conflits Tailwind et est incohérent avec le reste du projet.

```tsx
// ❌ À éviter — template literal, pas de résolution de conflit
<div className={`rounded-lg ${isActive ? "bg-success" : "bg-muted"}`}>

// ✅ Correct
<div className={cn("rounded-lg", isActive ? "bg-success" : "bg-muted")}>
```

## cva (class-variance-authority)

Utilisé pour définir les variants de composants shadcn. Exemple de référence (`components/ui/button.tsx`) :

```ts
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors ...",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        outline: "border bg-background hover:bg-accent",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3",
        lg: "h-10 px-6",
        icon: "size-9",
        "icon-sm": "size-7",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
```

**Avant de styler un nouveau bouton/badge/élément à variantes en dur**, vérifier si un `cva` existant (dans `components/ui/`) couvre déjà le besoin via une combinaison `variant`+`size`. Ne dupliquer la logique cva que pour un composant véritablement nouveau, jamais pour reproduire un style qui existe déjà sous forme de variant.

## Piège : `transition-all` vs `transition-colors`

Un composant utilisant `transition-all` anime TOUTES les propriétés CSS qui changent (couleur, opacité, dimensions, ombres), ce qui peut créer des effets de bord inattendus (ex: micro-décalage de rendu pendant qu'un `disabled:opacity-50` transite, pouvant créer une confusion de curseur système près de la frontière de l'élément — déjà observé dans ce projet sur un bouton d'envoi de message). Préférer `transition-colors` quand seule la couleur doit être animée (cas le plus fréquent pour les boutons/badges), réserver `transition-all` aux cas où plusieurs propriétés doivent réellement transiter ensemble (ex: un panneau qui change à la fois de taille et d'opacité).

## Espacement entre éléments interactifs proches

Un `gap-2` (8px) entre deux éléments interactifs adjacents (ex: input + bouton d'envoi) peut créer une zone de frontière trop fine où le curseur système hésite entre les deux éléments au moindre tremblement de souris. Pour deux éléments interactifs côte à côte (pas juste décoratifs), préférer `gap-3` minimum si l'espace le permet.
